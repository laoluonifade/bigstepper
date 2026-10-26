import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ActivityType, CompetitionFormat } from '../competition-rules';

export class ScoringFieldsDto {
  @IsOptional() @IsInt() @Min(1000) @Max(10_000_000)
  targetSteps?: number;

  @IsOptional() @IsInt() @Min(600) @Max(3_600_000)
  targetSeconds?: number;

  @IsOptional() @IsInt() @Min(1) @Max(1000)
  targetSessions?: number;

  @IsOptional() @IsInt() @Min(1) @Max(500_000)
  dailyTarget?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  minSessions?: number;

  @IsOptional() @IsInt() @Min(100) @Max(100_000)
  minActivityMetres?: number;

  @IsOptional() @IsInt() @Min(60) @Max(36_000)
  minActivitySeconds?: number;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @IsIn(['run', 'walk', 'cycle'], { each: true })
  eligibleActivities?: ActivityType[];

  @IsOptional() @IsIn(['open', 'invite', 'head_to_head'])
  format?: CompetitionFormat;

  @IsOptional() @IsString() @MaxLength(64)
  timeZone?: string;
}
