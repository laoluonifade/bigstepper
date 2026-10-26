import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { ClubPrizesDto } from '../../prizes/dto/prizes.dto';

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

  @IsOptional() @ValidateIf((_, value) => value !== null) @ValidateNested() @Type(() => ClubPrizesDto)
  clubPrizes?: ClubPrizesDto | null;
}

export class PublishDto {
  @IsOptional() @IsDateString()
  at?: string;
}

export class DuplicateDto {
  @IsOptional() @IsDateString()
  startsAt?: string;
}

export class CreateSeriesDto {
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

  @IsOptional() @IsInt() @Min(0) @Max(30)
  leadDays?: number;

  @IsOptional() @IsString()
  templateFromCode?: string;
}
