import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

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
