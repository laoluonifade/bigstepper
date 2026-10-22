import { validateSync } from 'class-validator';
import { CreateTableDto } from './create-table.dto';

describe('fixed funded-free amount', () => {
  it.each([999_900, 1_000_000])('validates %i kobo at the ₦10,000 boundary', (amount) => {
    const input = Object.assign(new CreateTableDto(), { title: 'Morning run', capacity: 5, guaranteedPrizeKobo: amount });
    const errors = validateSync(input).filter((error) => error.property === 'guaranteedPrizeKobo');
    expect(errors.length === 0).toBe(amount >= 1_000_000);
  });
});
