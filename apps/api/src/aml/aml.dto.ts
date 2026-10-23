import { IsBoolean, IsIn, IsObject, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

/** KYC Level 2: the runner's legal name, BVN and a bank account in that name. */
export class SubmitKycDto {
  @IsString() @Length(2, 80) firstName: string;
  @IsString() @Length(2, 80) lastName: string;
  @Matches(/^\d{11}$/, { message: 'Your BVN is 11 digits' }) bvn: string;
  @Matches(/^\d{10}$/, { message: 'Account numbers are 10 digits' }) accountNumber: string;
  @IsString() @Length(2, 20) bankCode: string;
  @IsString() @Length(8, 72) password: string;
}

export class UpdateAmlSettingsDto {
  @IsObject() values: Record<string, unknown>;
}

export class ReviewFlagDto {
  @IsIn(['DISMISSED', 'CONFIRMED', 'ESCALATED']) decision: 'DISMISSED' | 'CONFIRMED' | 'ESCALATED';
  @IsString() @MinLength(5) @MaxLength(1000) note: string;
}

export class PayoutHoldDto {
  @IsBoolean() hold: boolean;
  @IsString() @MinLength(5) @MaxLength(300) note: string;
}

export class EscalateDto {
  @IsString() @MinLength(5) @MaxLength(1000) note: string;
}
