import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

export class ApprovePayoutDto extends ConfirmAdminActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
