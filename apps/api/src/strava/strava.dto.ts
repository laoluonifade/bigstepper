import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class StravaCodeDto {
  @IsString()
  @MaxLength(200)
  code: string;

  /** The scopes the athlete actually granted (Strava sends them back on the redirect). */
  @IsString()
  @MaxLength(200)
  scope: string;
}

export class StravaSignupDto {
  @IsString()
  @MaxLength(1000)
  signupToken: string;

  @IsEmail()
  email: string;

  @Matches(/^[A-Z]{2}$/, { message: 'Choose your country of residence' })
  countryCode: string;

  @IsOptional()
  @IsIn(['male', 'female', 'non_binary', 'prefer_not_to_say'])
  gender?: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';

  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'Enter your WhatsApp number with its country code' })
  whatsappNumber?: string;
}
