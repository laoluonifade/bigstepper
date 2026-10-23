import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { ClubPrizesDto } from '../../prizes/dto/prizes.dto';

/** A draft or scheduled challenge can change anything people see before it opens. */
export class EditDraftDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120)
  title?: string;

  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @MaxLength(280)
  description?: string | null;

  @IsOptional() @IsDateString()
  startsAt?: string;

  @IsOptional() @IsDateString()
  scoringClosesAt?: string;

  @IsOptional() @IsInt() @Min(2) @Max(10000)
  capacity?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(60) @Matches(/^[A-Z]{2}$/, { each: true })
  eligibleCountries?: string[];

  /** Replaces the prizes; null removes them. */
  @IsOptional() @ValidateIf((_, value) => value !== null) @ValidateNested() @Type(() => ClubPrizesDto)
  clubPrizes?: ClubPrizesDto | null;
}

/** Open it now, or schedule it to open at `at`. */
export class PublishDto {
  @IsOptional() @IsDateString()
  at?: string;
}

/** A new draft copy with the same rules and prizes, starting at `startsAt` (default: a week after the original). */
export class DuplicateDto {
  @IsOptional() @IsDateString()
  startsAt?: string;
}

export class CreateSeriesDto {
  /** The challenge to repeat: it becomes edition 1 and the template for the rest. */
  @IsString()
  fromCode: string;

  @IsIn(['weekly', 'monthly'])
  cadence: 'weekly' | 'monthly';

  @IsBoolean()
  autoPublish: boolean;
}

export class UpdateSeriesDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120)
  title?: string;

  @IsOptional() @IsBoolean()
  autoPublish?: boolean;

  @IsOptional() @IsBoolean()
  active?: boolean;

  /** Days before each edition starts that it's created (and opened, when it publishes on its own). */
  @IsOptional() @IsInt() @Min(0) @Max(30)
  leadDays?: number;

  /** Use this edition's rules, title, branding and prizes for the editions after it. */
  @IsOptional() @IsString()
  templateFromCode?: string;
}
