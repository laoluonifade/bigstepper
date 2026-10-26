import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

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

  /** Picked at sign-up; without it the account gets a generated one and is asked to choose later. */
  @IsOptional()
  @Matches(/^[a-z0-9_]{2,30}$/, { message: 'Usernames are 2–30 lowercase letters, numbers and underscores' })
  username?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'non_binary', 'prefer_not_to_say'])
  gender?: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  /** International format, e.g. +2348012345678. Private: only the runner and Jump see it. */
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'Enter your WhatsApp number with its country code' })
  whatsappNumber?: string;
}

export class GoogleSignInDto {
  /** The ID token from Google Sign-In on the phone or the web. */
  @IsString()
  @Length(20, 4096)
  idToken: string;

  /** The device's region, for a new account's country. Changeable later in the profile. */
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;
}

export class AppleSignInDto {
  @IsString()
  @Length(20, 4096)
  identityToken: string;

  /** One-time code, swapped for a refresh token so deleting the account can revoke it. */
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  authorizationCode?: string;

  /** Apple shares the name only on the very first sign-in. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;
}
