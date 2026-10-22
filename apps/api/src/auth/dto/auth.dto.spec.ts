import { validate } from 'class-validator';
import { RegisterDto } from './auth.dto';

describe('RegisterDto residency', () => {
  const registration = (countryCode?: string) => Object.assign(new RegisterDto(), {
    email: 'runner@example.com', password: 'long-enough-password', countryCode,
  });

  it('requires a country of residence', async () => {
    expect(await validate(registration())).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: 'countryCode' }),
    ]));
  });

  it('accepts an ISO country code', async () => {
    expect(await validate(registration('GH'))).toHaveLength(0);
  });
});
