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
}
