import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** What a host can change after creating; see TablesService.update for when each applies. */
export class UpdateTableDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120)
  title?: string;

  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @MaxLength(280)
  description?: string | null;

  @IsOptional() @IsDateString()
  startsAt?: string;

  /** null makes a free competition open-ended. */
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsDateString()
  scoringClosesAt?: string | null;

  /** Close it now. */
  @IsOptional() @IsIn([true])
  endNow?: true;
}

export class ArchiveTableDto {
  @IsBoolean()
  archived: boolean;
}
