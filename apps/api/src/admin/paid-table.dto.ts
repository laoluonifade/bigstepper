import { OmitType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { CHALLENGE_TYPES, ChallengeType, SCORING_METHODS, ScoringMethod } from '../tables/challenge-types';

export class CreatePaidTableDto {
  @IsUUID() creatorId: string;
  @IsString() @MinLength(3) title: string;
  @IsIn(CHALLENGE_TYPES) challengeType: ChallengeType;
  @IsIn(SCORING_METHODS) scoringMethod: ScoringMethod;
  @IsOptional() @IsInt() @Min(100) @Max(500000) targetDistanceMetres?: number;
  @IsOptional() @IsUUID() communityId?: string;
  @IsInt() @Min(100) @Max(100000000) entryFeeKobo: number;
  @IsInt() @Min(100) @Max(1000000000) guaranteedPrizeKobo: number;
  @IsInt() @Min(2) @Max(10000) minimumEntrants: number;
  @IsInt() @Min(2) @Max(10000) capacity: number;
  @IsDateString() startsAt: string;
  @IsDateString() entryClosesAt: string;
  @IsDateString() scoringClosesAt: string;
}

export class CreateCreatorPaidChallengeDto extends OmitType(CreatePaidTableDto, ['creatorId'] as const) {}

export class ApprovePaidTableDto {
  @IsBoolean() fundingConfirmed: boolean;
  @IsBoolean() rulesApproved: boolean;
}
