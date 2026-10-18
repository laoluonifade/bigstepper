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
