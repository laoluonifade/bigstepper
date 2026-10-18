import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CHALLENGE_TYPES, ChallengeType, SCORING_METHODS, ScoringMethod } from '../challenge-types';

export class CreateTableDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @IsOptional() @IsIn(CHALLENGE_TYPES)
  challengeType?: ChallengeType;

  @IsOptional() @IsIn(SCORING_METHODS)
  scoringMethod?: ScoringMethod;

  @IsOptional() @IsInt() @Min(100) @Max(500000)
  targetDistanceMetres?: number;

  @IsOptional() @IsUUID()
  communityId?: string;

  @IsOptional()
  @IsDateString()
  scoringClosesAt?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  entryClosesAt?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10000)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(500000)
  distanceCapMetres?: number;
}
