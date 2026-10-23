import { OmitType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CHALLENGE_TYPES, ChallengeType, SCORING_METHODS, ScoringMethod } from '../tables/challenge-types';
import { ScoringFieldsDto } from '../tables/dto/scoring-fields.dto';

export class CreatePaidTableDto extends ScoringFieldsDto {
  @IsUUID() creatorId: string;
  @IsString() @MinLength(3) title: string;
  @IsOptional() @IsString() @MaxLength(280) description?: string;
  @IsIn(CHALLENGE_TYPES) challengeType: ChallengeType;
  @IsIn(SCORING_METHODS) scoringMethod: ScoringMethod;
  @IsOptional() @IsInt() @Min(100) @Max(1_000_000) targetDistanceMetres?: number;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) reminderTime?: string;
  @IsOptional() @IsString() @MaxLength(64) reminderTimeZone?: string;
  @IsOptional() @IsUUID() communityId?: string;
  @IsInt() @Min(100) @Max(100000000) entryFeeKobo: number;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) @Min(1, { each: true }) prizeSplitBps?: number[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true }) inviteEmails?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @Matches(/^\+[1-9]\d{7,14}$/, { each: true }) invitePhones?: string[];
  @IsOptional() @IsIn([true]) inviteClubMembers?: true;
  /** Defaults to 2: a paid race needs at least two people. */
  @IsOptional() @IsInt() @Min(2) @Max(10000) minimumEntrants?: number;
  @IsInt() @Min(2) @Max(10000) capacity: number;
  @IsDateString() startsAt: string;
  /** Defaults to when the challenge ends: entry stays open the whole time. */
  @IsOptional() @IsDateString() entryClosesAt?: string;
  @IsDateString() scoringClosesAt: string;
}

export class CreateCreatorPaidChallengeDto extends OmitType(CreatePaidTableDto, ['creatorId'] as const) {}

export class ApprovePaidTableDto {
  @IsBoolean() fundingConfirmed: boolean;
  @IsBoolean() rulesApproved: boolean;
}
