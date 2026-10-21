import { createHmac } from 'node:crypto';
import { PaymentsService } from './payments.service';

describe('PaymentsService webhook signatures', () => {
  const secret = 'sk_test_signature_secret';
  const service = new PaymentsService(
    {} as never,
    {} as never,
    {} as never,
    { getOrThrow: () => secret, get: (key: string) => key === 'PAID_CONTESTS_ENABLED' ? true : secret } as never,
    {} as never,
  );

  it('accepts the exact HMAC SHA512 signature for the raw body', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    expect(service.verifySignature(body, signature)).toBe(true);
  });

  it('rejects altered payloads and malformed signatures', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    expect(service.verifySignature(Buffer.from('{}'), signature)).toBe(false);
    expect(service.verifySignature(body, 'bad')).toBe(false);
  });
});

describe('funded-free checkout', () => {
  const user = { id: 'runner', email: 'runner@example.com', emailVerified: true };
  const table = { id: 'challenge', type: 'sponsored', status: 'OPEN_FOR_ENTRY', guaranteedPrizeKobo: null, scoringClosesAt: new Date(Date.now() + 60_000) };
  const intents = {
    findOne: jest.fn().mockResolvedValue(null),
    exist: jest.fn().mockResolvedValue(false),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ ...value, id: 'intent' })),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    getRepository: jest.fn((entity) => ({ findOne: jest.fn().mockResolvedValue(entity.name === 'User' ? user : table) })),
    manager: { query: jest.fn().mockResolvedValue([]) },
    query: jest.fn(),
  };
  const paystack = { initialize: jest.fn().mockResolvedValue({ authorization_url: 'https://paystack.example/checkout', access_code: 'access' }) };
  const config = { get: jest.fn((key) => key === 'PAID_CONTESTS_ENABLED' ? true : key === 'PAYSTACK_SECRET_KEY' ? 'sk_test_example' : undefined) };
  const service = new PaymentsService(intents as never, {} as never, dataSource as never, config as never, paystack as never);

  it('uses the funder-selected amount for an open free challenge', async () => {
    const result = await service.fundPrize(user.id, table.id, 12_345);
    expect(paystack.initialize).toHaveBeenCalledWith(expect.objectContaining({ amount: 12_345 }));
    expect(result.reference).toMatch(/^jump-prize-/);
  });

  it('rejects a zero contribution before creating a payment', async () => {
    await expect(service.fundPrize(user.id, table.id, 0)).rejects.toThrow('Funding amount is outside the allowed range');
  });

  it('only checks a payment with Paystack after confirming it belongs to this user', async () => {
    const verify = jest.spyOn(service as unknown as { verifyAndFulfill: (reference: string) => Promise<void> }, 'verifyAndFulfill').mockResolvedValue();
    intents.findOne.mockResolvedValueOnce(null);
    await expect(service.verifyOwnPayment(user.id, 'another-users-payment')).rejects.toThrow('Payment not found');
    expect(verify).not.toHaveBeenCalled();
    intents.findOne.mockResolvedValueOnce({ reference: 'own-payment', status: 'PENDING', amountKobo: 10_000, currency: 'NGN' })
      .mockResolvedValueOnce({ reference: 'own-payment', status: 'SUCCEEDED', amountKobo: 10_000, currency: 'NGN' });
    await expect(service.verifyOwnPayment(user.id, 'own-payment')).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(verify).toHaveBeenCalledWith('own-payment');
    verify.mockRestore();
  });

  it('allows only the host to fund a fixed charity challenge', async () => {
    Object.assign(table, { guaranteedPrizeKobo: 10_000, status: 'PENDING_FUNDING', fundingDestination: 'CHARITY', creatorId: 'host' });
    try {
      await expect(service.fundPrize(user.id, table.id, 10_000)).rejects.toThrow('Only the host can fund a fixed competition');
    } finally {
      Object.assign(table, { guaranteedPrizeKobo: null, status: 'OPEN_FOR_ENTRY', fundingDestination: 'WINNERS', creatorId: undefined });
    }
  });

  it('closes an old checkout only after Paystack reports it abandoned', async () => {
    dataSource.query.mockResolvedValueOnce([{ reference: 'old' }]).mockResolvedValueOnce([]);
    intents.findOne.mockResolvedValueOnce({ id: 'old-id', reference: 'old', amountKobo: 500, currency: 'NGN', status: 'PENDING', createdAt: new Date(Date.now() - 16 * 60_000) });
    (paystack as typeof paystack & { verifyTransaction: jest.Mock }).verifyTransaction = jest.fn().mockResolvedValue({ reference: 'old', amount: 500, currency: 'NGN', status: 'abandoned' });
    await service.sweepAbandonedCheckouts();
    expect(dataSource.query.mock.calls[1][1]).toEqual(['old-id', true, false, 'abandoned']);
  });

  it('keeps an old checkout open while Paystack says payment is ongoing', async () => {
    dataSource.query.mockReset().mockResolvedValueOnce([{ reference: 'ongoing' }]).mockResolvedValueOnce([]);
    intents.findOne.mockResolvedValueOnce({ id: 'ongoing-id', reference: 'ongoing', amountKobo: 500, currency: 'NGN', status: 'PENDING', createdAt: new Date(Date.now() - 16 * 60_000) });
    (paystack as typeof paystack & { verifyTransaction: jest.Mock }).verifyTransaction = jest.fn().mockResolvedValue({ reference: 'ongoing', amount: 500, currency: 'NGN', status: 'ongoing' });
    await service.sweepAbandonedCheckouts();
    expect(dataSource.query.mock.calls[1][1]).toEqual(['ongoing-id', false, false, 'ongoing']);
  });
});
