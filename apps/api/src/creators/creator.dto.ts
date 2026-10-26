import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreatorSignupDto {
  @IsIn(['influencer', 'community_manager', 'run_club', 'other'])
  creatorType: 'influencer' | 'community_manager' | 'run_club' | 'other';

  @IsString() @MinLength(2) @MaxLength(100)
  displayName: string;

  /** Any form people paste ("instagram.com/x", "www.x.com/x", "http://…"): https is added when missing. */
  @IsOptional() @Transform(({ value }) => normaliseUrl(value))
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }, { message: 'Enter a link, like instagram.com/yourname' }) @MaxLength(300)
  socialUrl?: string;

  @IsOptional() @IsString() @MaxLength(500)
  bio?: string;
}

function normaliseUrl(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, '');
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}
