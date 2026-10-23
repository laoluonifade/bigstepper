import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 30)
  @Matches(/^[a-z0-9_]+$/)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsIn(['km', 'mi'])
  preferredUnit?: 'km' | 'mi';

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  /** null clears the preference. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(['male', 'female', 'non_binary', 'prefer_not_to_say'])
  gender?: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say' | null;

  /** null clears it. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(160)
  bio?: string | null;

  /** null clears the goal. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1000)
  @Max(1_000_000)
  weeklyGoalMetres?: number | null;

  /** null removes the private estimate setting. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(20)
  @Max(300)
  weightKg?: number | null;

  @IsOptional() @IsBoolean()
  emailActivityEnabled?: boolean;

  @IsOptional() @IsBoolean()
  emailDigestEnabled?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'Enter your WhatsApp number with its country code' })
  whatsappNumber?: string | null;
}
