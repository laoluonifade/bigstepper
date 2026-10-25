import type { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { PushNotificationsProcessor } from './push-notifications.processor';

const job = { name: 'send-push' } as Job;

function setup(pending: Array<Record<string, unknown>>, tokens: Array<{ token: string; userId: string }>) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('"pushClaimedAt"=now()')) return pending;
    if (sql.includes('FROM "push_tokens"')) return tokens;
    if (sql.includes('COUNT(*)')) return [{ userId: 'u1', count: 3 }];
    return [];
  });
  const processor = new PushNotificationsProcessor({ query } as unknown as DataSource, { get: () => undefined } as unknown as ConfigService, {} as Queue);
  return { processor, query };
}

const now = () => new Date();

describe('PushNotificationsProcessor', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('sends each new notification to every phone of its runner, with their unread count as the badge', async () => {
    const { processor, query } = setup([{ id: 'n1', userId: 'u1', type: 'DIRECT_MESSAGE', title: 'Ada sent you a message', body: 'Open Messages to reply.', link: '/messages/ada', createdAt: now() }],
      [{ token: 'ExponentPushToken[a]', userId: 'u1' }, { token: 'ExponentPushToken[b]', userId: 'u1' }]);
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await processor.process(job);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.map((message: { to: string }) => message.to)).toEqual(['ExponentPushToken[a]', 'ExponentPushToken[b]']);
    expect(sent[0]).toMatchObject({ title: 'Ada sent you a message', badge: 3, channelId: 'messages', sound: 'default', data: { link: '/messages/ada' } });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('"pushProcessedAt"=now()'))).toBe(true);
  });

  it('forgets a phone that has uninstalled the app', async () => {
    const { processor, query } = setup([{ id: 'n1', userId: 'u1', type: 'LEADERBOARD_UPDATE', title: 'x', body: 'y', link: null, createdAt: now() }], [{ token: 'ExponentPushToken[old]', userId: 'u1' }]);
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }) })) as unknown as typeof fetch;
    await processor.process(job);
    const removal = query.mock.calls.find(([sql]) => String(sql).startsWith('DELETE FROM "push_tokens"'));
    expect(removal?.[1]).toEqual([['ExponentPushToken[old]']]);
  });

  it('marks stale notifications handled without buzzing anyone', async () => {
    const { processor, query } = setup([{ id: 'n1', userId: 'u1', type: 'X', title: 'x', body: 'y', link: null, createdAt: new Date(Date.now() - 2 * 3600_000) }], [{ token: 'ExponentPushToken[a]', userId: 'u1' }]);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await processor.process(job);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('"pushProcessedAt"=now()'))).toBe(true);
  });

  it('leaves notifications claimed (to retry) when Expo is unreachable', async () => {
    const { processor, query } = setup([{ id: 'n1', userId: 'u1', type: 'X', title: 'x', body: 'y', link: null, createdAt: now() }], [{ token: 'ExponentPushToken[a]', userId: 'u1' }]);
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, text: async () => 'down' })) as unknown as typeof fetch;
    await processor.process(job);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('"pushProcessedAt"=now()'))).toBe(false);
  });
});
