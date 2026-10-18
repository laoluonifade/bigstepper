import { IsBoolean, IsISO31661Alpha2 } from 'class-validator';

export class UpdateUserEligibilityDto {
  @IsBoolean()
  adultVerified: boolean;

  @IsBoolean()
  paidCompetitionEligible: boolean;

  @IsISO31661Alpha2()
  countryCode: string;
}
