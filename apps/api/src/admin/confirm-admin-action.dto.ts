import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Money actions need a fresh emailed code (POST /admin-auth/confirm-code), not a password. */
export class ConfirmAdminActionDto {
  @IsString()
  @Matches(/^\s*\d{6}\s*$/)
  code: string;
}

export class RejectPayoutDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}

/** A payout held for risk review needs the reviewer's reasons recorded with the approval. */
export class ApprovePayoutDto extends ConfirmAdminActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
