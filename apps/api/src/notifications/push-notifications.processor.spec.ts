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
  const processor = new PushNotificationsProcessor({ query } as unknown as DataSource, { get: () => undefined } as unknown as ConfigService, {} as Queue, { reserve: jest.fn().mockResolvedValue({allowed:true}), finish: jest.fn(), event: jest.fn() } as never, {} as never);
  return { processor, query };
}

const now = () => new Date();

describe('PushNotificationsProcessor', () => {
  it('claims with a query that returns rows (a bare UPDATE … RETURNING comes back as [rows, count])', async () => {
    const { processor, query } = setup([], []);
    await processor.process(job);
    const claim = String(query.mock.calls.find(([sql])=>String(sql).includes('"pushClaimedAt"=now()'))?.[0]);
    expect(claim).toContain('claimed AS (');
    expect(claim.trim().endsWith('SELECT * FROM claimed')).toBe(true);
  });

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

  it('sends many notifications in one Expo request and marks them processed together', async () => {
    const { processor, query } = setup([
      { id: 'n1', userId: 'u1', type: 'FOLLOW', title: 'a', body: 'b', link: '/u/1', createdAt: now() },
      { id: 'n2', userId: 'u2', type: 'FOLLOW', title: 'c', body: 'd', link: '/u/2', createdAt: now() },
    ], [{ token: 'ExponentPushToken[a]', userId: 'u1' }, { token: 'ExponentPushToken[b]', userId: 'u2' }, { token: 'ExponentPushToken[c]', userId: 'u2' }]);
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }, { status: 'error' }] }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await processor.process(job);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.map((message: { data: { id: string } }) => message.data.id)).toEqual(['n1', 'n2', 'n2']);
    const marked = query.mock.calls.find(([sql]) => String(sql).includes('"pushProcessedAt"=now() WHERE "id"=ANY'));
    expect(marked?.[1]).toEqual([['n1', 'n2']]);
  });

  it('forgets a phone that has uninstalled the app', async () => {
    const { processor, query } = setup([{ id: 'n1', userId: 'u1', type: 'LEADERBOARD_UPDATE', title: 'x', body: 'y', link: null, createdAt: now() }], [{ token: 'ExponentPushToken[old]', userId: 'u1' }]);
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }) })) as unknown as typeof fetch;
    await processor.process(job);
    const removal = query.mock.calls.find(([sql]) => /DELETE FROM "?push_tokens/.test(String(sql)));
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

  it('skips one already read (the chat was opened before the push went out)', async () => {
    const { processor, query } = setup([{ id: 'n1', userId: 'u1', type: 'DIRECT_MESSAGE', title: 'x', body: 'y', link: '/messages/ada', createdAt: now(), readAt: now() }], [{ token: 'ExponentPushToken[a]', userId: 'u1' }]);
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

  it('drops phones still on the old Expo project and sends to the rest, when Expo refuses the mixed batch', async () => {
    const { processor, query } = setup([{ id: 'n1', userId: 'u1', type: 'X', title: 'x', body: 'y', link: null, createdAt: now() }],
      [{ token: 'ExponentPushToken[old]', userId: 'u1' }, { token: 'ExponentPushToken[new]', userId: 'u1' }]);
    const refusal = { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', details: { '@ayomicoder/jump': ['ExponentPushToken[old]'], '@startajump/jump': ['ExponentPushToken[new]'] } }] };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => JSON.stringify(refusal) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await processor.process(job);
    const removal = query.mock.calls.find(([sql]) => /DELETE FROM "?push_tokens/.test(String(sql)));
    expect(removal?.[1]).toEqual([['ExponentPushToken[old]']]);
    const resent = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body);
    expect(resent.map((message: { to: string }) => message.to)).toEqual(['ExponentPushToken[new]']);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('"pushProcessedAt"=now()'))).toBe(true);
  });
  it('never calls Expo after shared policy suppression',async()=>{
    const {processor}=setup([{id:'n',userId:'u1',type:'MILESTONE',title:'Done',body:'Progress',link:'/activities',createdAt:now()}],[{token:'ExponentPushToken[a]',userId:'u1'}]);
    const policy=(processor as unknown as {engagement:{reserve:jest.Mock}}).engagement;
    policy.reserve.mockResolvedValue({allowed:false,reason:'quiet_hours'});
    global.fetch=jest.fn();await processor.process(job);expect(global.fetch).not.toHaveBeenCalled();
  });
  it('keeps explicitly rate-limited optional pushes eligible for a bounded retry',async()=>{
    const {processor,query}=setup([{id:'n',userId:'u1',type:'MILESTONE',title:'Done',body:'Progress',link:'/activities',createdAt:now()}],[{token:'ExponentPushToken[a]',userId:'u1'}]);
    const policy=(processor as unknown as {engagement:{reserve:jest.Mock;finish:jest.Mock}}).engagement;
    policy.reserve.mockResolvedValue({allowed:true,id:'delivery'});
    global.fetch=jest.fn().mockResolvedValue({ok:false,status:429,text:async()=>''});await processor.process(job);
    expect(policy.finish).toHaveBeenCalledWith('delivery','failed','retryable');
    expect(query.mock.calls.some(([sql])=>String(sql).includes('"pushProcessedAt"=now()'))).toBe(false);
  });
  it('records Expo receipts without treating provider acceptance as device delivery',async()=>{
    const {processor,query}=setup([{id:'n',userId:'u1',type:'MILESTONE',title:'Done',body:'Progress',link:'/activities',createdAt:now()}],[{token:'ExponentPushToken[a]',userId:'u1'}]);
    const policy=(processor as unknown as {engagement:{reserve:jest.Mock;finish:jest.Mock}}).engagement;policy.reserve.mockResolvedValue({allowed:true,id:'delivery'});
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({data:[{status:'ok',id:'receipt'}]})});await processor.process(job);
    expect(query.mock.calls.some(([sql])=>String(sql).includes('INSERT INTO notification_push_receipts'))).toBe(true);
    expect(policy.finish).toHaveBeenCalledWith('delivery','sent',undefined);
    expect(policy.finish).not.toHaveBeenCalledWith('delivery','delivered');
  });

});
