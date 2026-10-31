import { EmailUpdatesProcessor } from './email-updates.processor';

describe('EmailUpdatesProcessor', () => {
  const mail = { canSendBulk: true, send: jest.fn().mockResolvedValue(undefined) };
  const config = { getOrThrow: jest.fn().mockReturnValue('https://jump.example') };
  const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
  const dataSource = { query: jest.fn() };
  const processor = new EmailUpdatesProcessor(dataSource as never, mail as never, config as never, queue as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mail.canSendBulk = true;
  });

  it('groups multiple notifications for the same runner into one email', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 'a', userId: 'runner', title: 'A new message', email: 'runner@example.com', displayName: 'Runner', emailVerified: true, emailActivityEnabled: true },
      { id: 'b', userId: 'runner', title: 'A new follower', email: 'runner@example.com', displayName: 'Runner', emailVerified: true, emailActivityEnabled: true },
    ]).mockResolvedValueOnce([]);

    await processor.process({ name: 'send-notifications' } as never);

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].subject).toContain('2 new updates');
    expect(dataSource.query.mock.calls[1][1]).toEqual([['a', 'b']]);
  });

  it('keeps in-app updates but does not email runners who opted out', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 'a', userId: 'runner', title: 'A new message', email: 'runner@example.com', displayName: 'Runner', emailVerified: true, emailActivityEnabled: false },
    ]).mockResolvedValueOnce([]);

    await processor.process({ name: 'send-notifications' } as never);

    expect(mail.send).not.toHaveBeenCalled();
    expect(dataSource.query.mock.calls[1][0]).toContain('"emailProcessedAt"=now()');
  });

  it('still sends payout alerts after an activity-email opt-out', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 'a', userId: 'runner', type: 'PAYOUT_RECIPIENT_CHANGED', title: 'Payout account changed', email: 'runner@example.com', displayName: 'Runner', emailVerified: true, emailActivityEnabled: false },
    ]).mockResolvedValueOnce([]);

    await processor.process({ name: 'send-notifications' } as never);

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].subject).toContain('Payout account changed');
  });

  it('does not claim or mark emails sent without a configured provider', async () => {
    mail.canSendBulk = false;

    await processor.process({ name: 'send-notifications' } as never);

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('skips the digest when no competition is open', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await processor.process({ name: 'send-digests' } as never);

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('sends the digest with competitions with or without a banner, linked to the configured site', async () => {
    dataSource.query.mockResolvedValueOnce([
      { title: 'Lagos 10K', code: 'LAG10K', challengeType: 'RUN', format: 'open', scoringMethod: 'TOTAL_DISTANCE', bannerUrl: 'https://img.example/a.jpg', entrants: 12 },
      { title: 'Office steps', code: 'STEPS', challengeType: 'STEP', format: 'head_to_head', scoringMethod: 'TOTAL_STEPS', bannerUrl: null, entrants: 3 },
    ]).mockResolvedValueOnce([{ userId: 'runner', email: 'runner@example.com', displayName: 'Ada Lovelace' }]).mockResolvedValue([]);

    await processor.process({ name: 'send-digests' } as never);

    expect(dataSource.query.mock.calls[0][0]).toContain('"archivedAt" IS NULL');
    expect(mail.send).toHaveBeenCalledTimes(1);
    const message = mail.send.mock.calls[0][0];
    expect(message.html).toContain('https://jump.example/competitions/LAG10K');
    expect(message.html).toContain('https://jump.example/competitions/STEPS');
    expect(message.html).not.toContain('startajump.com/competitions');
    expect(message.html).toContain('Head to head');
    expect(message.html).not.toContain('head_to_head');
    expect(message.html.match(/<img src="https:\/\/img\.example/g)).toHaveLength(1);
    expect(dataSource.query.mock.calls[2][0]).toContain('"digestNextAt"=now()+interval');
  });
});
