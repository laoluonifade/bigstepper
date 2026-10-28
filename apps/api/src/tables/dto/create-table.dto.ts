import { ArrayMaxSize, IsBoolean, ArrayMinSize, IsArray, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CHALLENGE_TYPES, ChallengeType, SCORING_METHODS, ScoringMethod } from '../challenge-types';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { ClubPrizesDto } from '../../prizes/dto/prizes.dto';
import { ScoringFieldsDto } from './scoring-fields.dto';

export class SeriesInputDto {
  @IsIn(['weekly', 'monthly'])
  cadence: 'weekly' | 'monthly';

  @IsBoolean()
  autoPublish: boolean;
}

export class CreateTableDto extends ScoringFieldsDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @IsOptional() @IsString() @MaxLength(280)
  description?: string;

  @IsOptional() @IsIn(['public', 'private'])
  visibility?: 'public' | 'private';

  @IsOptional() @IsBoolean()
  openEnded?: boolean;

  @IsOptional() @IsIn(CHALLENGE_TYPES)
  challengeType?: ChallengeType;

  @IsOptional() @IsIn(SCORING_METHODS)
  scoringMethod?: ScoringMethod;

  @IsOptional() @IsInt() @Min(100) @Max(1_000_000)
  targetDistanceMetres?: number;

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  reminderTime?: string;

  @IsOptional() @IsString() @MaxLength(64)
  reminderTimeZone?: string;

  @IsOptional() @IsUUID()
  communityId?: string;

  @IsOptional() @IsInt() @Min(1000000) @Max(1000000000)
  guaranteedPrizeKobo?: number;

  @IsOptional() @IsIn(['WINNERS', 'CHARITY'])
  fundingDestination?: 'WINNERS' | 'CHARITY';

  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  charityName?: string;

  @IsOptional() @IsIn([true])
  fundedFree?: true;

  @IsOptional() @ValidateNested() @Type(() => ClubPrizesDto)
  clubPrizes?: ClubPrizesDto;

  @IsOptional() @IsArray() @ArrayMaxSize(60) @Matches(/^[A-Z]{2}$/, { each: true })
  eligibleCountries?: string[];

  @IsOptional() @IsIn(['now', 'schedule', 'draft'])
  publish?: 'now' | 'schedule' | 'draft';

  @IsOptional() @IsDateString()
  publishAt?: string;

  @IsOptional() @ValidateNested() @Type(() => SeriesInputDto)
  series?: SeriesInputDto;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) @Min(1, { each: true })
  prizeSplitBps?: number[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true })
  inviteEmails?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @Matches(/^\+[1-9]\d{7,14}$/, { each: true })
  invitePhones?: string[];

  @IsOptional() @IsIn([true])
  inviteClubMembers?: true;

  @IsOptional() @IsIn(['all', 'run', 'walk', 'cycle'])
  enrolAudience?: 'all' | 'run' | 'walk' | 'cycle';

  @IsOptional()
  @IsDateString()
  scoringClosesAt?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  entryClosesAt?: string;

  @IsInt()
  @Min(2)
  @Max(10000)
  capacity: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(500000)
  distanceCapMetres?: number;
}
