import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateClubDto {
  @IsString()
  @Length(3, 100)
  name: string;

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

export class UpdateClubDto {
  @IsOptional() @IsString() @Length(3, 100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(600)
  description?: string;

  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/)
  accentColor?: string;

  @IsOptional() @IsString() @MaxLength(80)
  location?: string;

  @IsOptional() @IsString() @MaxLength(200)
  website?: string;

  @IsOptional() @IsString() @MaxLength(40) @Matches(/^@?[A-Za-z0-9._]*$/)
  instagram?: string;

  @IsOptional() @IsIn(['open', 'invite'])
  privacy?: 'open' | 'invite';

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
