import { EmailUpdatesProcessor } from './email-updates.processor';

describe('EmailUpdatesProcessor', () => {
  const mail = { canSendBulk: true, send: jest.fn().mockResolvedValue(undefined) };
  const config = { getOrThrow: jest.fn().mockReturnValue('https://jump.example') };
  const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
  const dataSource = { query: jest.fn() };
  const processor = new EmailUpdatesProcessor(dataSource as never, mail as never, config as never, queue as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mail.canSendBulk = true;
  });

  it('passes each optional notification to the shared mail policy', async () => {
    dataSource.query.mockResolvedValueOnce([
      { createdAt:new Date(), link:'/notifications', id: 'a', userId: 'runner', title: 'A new message', email: 'runner@example.com', displayName: 'Runner', emailVerified: true, emailActivityEnabled: true },
      { createdAt:new Date(), link:'/notifications', id: 'b', userId: 'runner', title: 'A new follower', email: 'runner@example.com', displayName: 'Runner', emailVerified: true, emailActivityEnabled: true },
    ]).mockResolvedValueOnce([]);

    await processor.process({ name: 'send-notifications' } as never);

    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(mail.send.mock.calls[0][0].engagement).toMatchObject({userId:'runner'});
    expect(dataSource.query.mock.calls[1][1]).toEqual([['a', 'b']]);
  });

  it('keeps in-app updates but does not email runners who opted out', async () => {
    dataSource.query.mockResolvedValueOnce([
      { createdAt:new Date(), link:'/notifications', id: 'a', userId: 'runner', title: 'A new message', email: 'runner@example.com', displayName: 'Runner', emailVerified: true, emailActivityEnabled: false },
    ]).mockResolvedValueOnce([]);

    await processor.process({ name: 'send-notifications' } as never);

    expect(mail.send.mock.calls[0][0].engagement).toBeDefined();
    expect(dataSource.query.mock.calls[1][0]).toContain('"emailProcessedAt"=now()');
  });

  it('still sends payout alerts after an activity-email opt-out', async () => {
    dataSource.query.mockResolvedValueOnce([
      { createdAt:new Date(), link:'/notifications', id: 'a', userId: 'runner', type: 'PAYOUT_RECIPIENT_CHANGED', title: 'Payout account changed', email: 'runner@example.com', displayName: 'Runner', emailVerified: true, emailActivityEnabled: false },
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
  it('processes policy-suppressed emails without marking them sent',async()=>{
    mail.send.mockResolvedValueOnce(false);
    dataSource.query.mockResolvedValueOnce([{id:'a',userId:'runner',type:'MILESTONE',title:'Done',body:'Progress',link:'/activities',createdAt:new Date(),email:'runner@example.com',emailVerified:true,emailActivityEnabled:true}]).mockResolvedValue([]);
    await processor.process({name:'send-notifications'} as never);
    const sent=dataSource.query.mock.calls.find(([sql])=>String(sql).includes('"emailSentAt"=now()'));
    expect(sent?.[1]).toEqual([[]]);
  });

});
