import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreatorSignupDto {
  @IsIn(['influencer', 'community_manager', 'run_club', 'other'])
  creatorType: 'influencer' | 'community_manager' | 'run_club' | 'other';

  @IsString() @MinLength(2) @MaxLength(100)
  displayName: string;

  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(300)
  socialUrl?: string;

  @IsOptional() @IsString() @MaxLength(500)
  bio?: string;
}
