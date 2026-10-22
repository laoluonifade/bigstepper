import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 72)
  password: string;
}

export class RegisterDto extends LoginDto {
  @Matches(/^[A-Z]{2}$/, { message: 'Choose your country of residence' })
  countryCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  /** International format, e.g. +2348012345678. Private: only the runner and Jump see it. */
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'Enter your WhatsApp number with its country code' })
  whatsappNumber?: string;
}
