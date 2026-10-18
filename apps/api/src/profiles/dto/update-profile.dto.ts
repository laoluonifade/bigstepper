import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 30)
  @Matches(/^[a-z0-9_]+$/)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsIn(['km', 'mi'])
  preferredUnit?: 'km' | 'mi';

  @IsOptional()
  @IsIn(['private', 'followers', 'public'])
  activityVisibility?: 'private' | 'followers' | 'public';

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;
}
