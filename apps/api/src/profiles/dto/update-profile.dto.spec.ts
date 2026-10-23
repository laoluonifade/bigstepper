import { validateSync } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

describe('private body weight setting', () => {
  it.each([20, 72.5, 300, null])('allows %s kg or removal', (weightKg) => {
    const input = Object.assign(new UpdateProfileDto(), { weightKg });
    expect(validateSync(input)).toHaveLength(0);
  });

  it.each([19.9, 300.1, 72.55, '70'])('rejects %s', (weightKg) => {
    const input = Object.assign(new UpdateProfileDto(), { weightKg });
    expect(validateSync(input).some((error) => error.property === 'weightKg')).toBe(true);
  });
});

describe('avatar gender setting', () => {
  it.each(['male', 'female', 'non_binary', 'prefer_not_to_say', null])('allows %s', (gender) => {
    expect(validateSync(Object.assign(new UpdateProfileDto(), { gender }))).toHaveLength(0);
  });

  it('rejects an unknown choice', () => {
    expect(validateSync(Object.assign(new UpdateProfileDto(), { gender: 'unknown' })).some((error) => error.property === 'gender')).toBe(true);
  });
});
