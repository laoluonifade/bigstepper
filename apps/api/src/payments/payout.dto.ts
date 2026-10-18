import { IsString, Length, Matches } from 'class-validator';

export class CreateRecipientDto {
  @IsString() @Length(2, 100) accountName: string;
  @Matches(/^\d{10}$/) accountNumber: string;
  @IsString() @Length(2, 20) bankCode: string;
  @IsString() @Length(8, 72) password: string;
}
