import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class ResolveAccountDto {
  @Matches(/^\d{10}$/) accountNumber: string;
  @IsString() @Length(2, 20) bankCode: string;
}

export class CreateRecipientDto {
  /** Ignored: the name always comes from the bank via Paystack. Kept so older clients still validate. */
  @IsOptional() @IsString() @Length(2, 100) accountName?: string;
  @Matches(/^\d{10}$/) accountNumber: string;
  @IsString() @Length(2, 20) bankCode: string;
  @IsString() @Length(8, 72) password: string;
}
