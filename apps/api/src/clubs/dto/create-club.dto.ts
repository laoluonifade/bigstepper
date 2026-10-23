import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateClubDto {
  @IsString()
  @Length(3, 100)
  name: string;

  /** Made from the name when left out (the usual case); a number is added if it's taken. */
  @IsOptional()
  @IsString()
  @Length(3, 40)
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsOptional() @IsString() @MaxLength(600)
  description?: string;

  @IsOptional() @IsIn(['open', 'invite'])
  privacy?: 'open' | 'invite';
}

/** What managers can change. The handle stays fixed so shared links keep working. */
export class UpdateClubDto {
  @IsOptional() @IsString() @Length(3, 100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(600)
  description?: string;

  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/)
  accentColor?: string;

  @IsOptional() @IsString() @MaxLength(80)
  location?: string;

  /** Empty string clears it. */
  @IsOptional() @IsString() @MaxLength(200)
  website?: string;

  @IsOptional() @IsString() @MaxLength(40) @Matches(/^@?[A-Za-z0-9._]*$/)
  instagram?: string;

  @IsOptional() @IsIn(['open', 'invite'])
  privacy?: 'open' | 'invite';

  /** Only the owner and managers can send in the club chat. */
  @IsOptional() @IsBoolean()
  chatLocked?: boolean;
}

export class JoinClubDto {
  @IsOptional() @IsString() @MaxLength(16)
  invite?: string;
}

export class ClubRoleDto {
  @IsIn(['admin', 'member'])
  role: 'admin' | 'member';
}

export class InviteToClubDto {
  @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true })
  emails: string[];
}
