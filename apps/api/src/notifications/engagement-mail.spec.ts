import { MailService } from '../mail/mail.service';
const message = {
  to: { address: 'runner@example.com' },
  subject: 'Weekly recap',
  text: 'Movement',
  html: '<p>Movement</p>',
  engagement: { userId: 'u', type: 'WEEKLY_RECAP', key: 'week', link: '/activities', createdAt: new Date() },
};
describe('engagement email transport', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  function setup(allowed = true) {
    const config = {
      get: (key: string) =>
        (
          ({
            ZEPTOMAIL_API_KEY: 'test',
            ZEPTOMAIL_FROM_ADDRESS: 'hello@example.com',
            ZOHO_APP_PASS: 'test',
            SMTP_USER: 'hello@example.com',
          }) as Record<string, string>
        )[key],
      getOrThrow: () => 'https://api.example.test',
    };
    const policy = { reserve: jest.fn().mockResolvedValue({ allowed, id: 'delivery' }), finish: jest.fn() };
    return { mail: new MailService(config as never, policy as never), policy };
  }
  it('does not call either provider when policy suppresses the email', async () => {
    const { mail, policy } = setup(false);
    global.fetch = jest.fn();
    expect(await mail.send(message)).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(policy.finish).not.toHaveBeenCalled();
  });
  it('records provider acceptance only after a successful response', async () => {
    const { mail, policy } = setup();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    expect(await mail.send(message)).toBe(true);
    expect(policy.reserve).toHaveBeenCalledWith(message.engagement, 'email');
    expect(policy.finish).toHaveBeenCalledWith('delivery', 'sent');
  });
  it('does not send a second engagement email via fallback after ambiguous failure', async () => {
    const { mail, policy } = setup();
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const smtp = jest.spyOn(mail as never as { sendSmtp: () => Promise<void> }, 'sendSmtp');
    await expect(mail.send(message)).rejects.toThrow();
    expect(smtp).not.toHaveBeenCalled();
    expect(policy.finish).toHaveBeenCalledWith('delivery', 'uncertain', 'provider_error');
  });
  it('preserves SMTP fallback after a definite primary rejection',async()=>{
    const {mail,policy}=setup();global.fetch=jest.fn().mockResolvedValue({ok:false,status:401});
    jest.spyOn(mail as never as {sendSmtp:()=>Promise<void>},'sendSmtp').mockResolvedValue(undefined);
    expect(await mail.send(message)).toBe(true);expect(policy.finish).toHaveBeenCalledWith('delivery','sent');
  });
  it('does not retry after an ambiguous SMTP fallback failure',async()=>{
    const {mail,policy}=setup();global.fetch=jest.fn().mockResolvedValue({ok:false,status:429});
    jest.spyOn(mail as never as {sendSmtp:()=>Promise<void>},'sendSmtp').mockRejectedValue(new Error('timeout'));
    await expect(mail.send(message)).rejects.toThrow();expect(policy.finish).toHaveBeenCalledWith('delivery','uncertain','provider_error');
  });

});
