import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ConfirmAdminActionDto {
  @IsString()
  @Length(8, 72)
  password: string;
}

export class RejectPayoutDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}
