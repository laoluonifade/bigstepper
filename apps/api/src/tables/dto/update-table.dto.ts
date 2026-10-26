import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateTableDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120)
  title?: string;

  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @MaxLength(280)
  description?: string | null;

  @IsOptional() @IsDateString()
  startsAt?: string;

  @IsOptional() @ValidateIf((_, value) => value !== null) @IsDateString()
  scoringClosesAt?: string | null;

  @IsOptional() @IsIn([true])
  endNow?: true;
}

export class ArchiveTableDto {
  @IsBoolean()
  archived: boolean;
}
