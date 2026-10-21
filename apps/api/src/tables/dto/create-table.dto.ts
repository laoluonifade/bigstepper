import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CHALLENGE_TYPES, ChallengeType, SCORING_METHODS, ScoringMethod } from '../challenge-types';

export class CreateTableDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @IsOptional() @IsString() @MaxLength(280)
  description?: string;

  @IsOptional() @IsIn(CHALLENGE_TYPES)
  challengeType?: ChallengeType;

  @IsOptional() @IsIn(SCORING_METHODS)
  scoringMethod?: ScoringMethod;

  @IsOptional() @IsInt() @Min(100) @Max(500000)
  targetDistanceMetres?: number;

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  reminderTime?: string;

  @IsOptional() @IsString() @MaxLength(64)
  reminderTimeZone?: string;

  @IsOptional() @IsUUID()
  communityId?: string;

  @IsOptional() @IsInt() @Min(100) @Max(1000000000)
  guaranteedPrizeKobo?: number;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) @Min(1, { each: true })
  prizeSplitBps?: number[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true })
  inviteEmails?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @Matches(/^\+[1-9]\d{7,14}$/, { each: true })
  invitePhones?: string[];

  @IsOptional() @IsIn([true])
  inviteClubMembers?: true;

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
