import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsUUID, Matches, Max, MaxLength, Min, IsString, ValidateNested } from 'class-validator';

export class AppleHealthWorkoutDto {
  @IsUUID()
  id: string;

  @IsIn(['walk', 'run', 'cycle'])
  activityType: 'walk' | 'run' | 'cycle';

  @IsISO8601()
  startedAt: string;

  @IsISO8601()
  finishedAt: string;

  @IsNumber()
  @Min(0)
  @Max(500_000)
  distanceMetres: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200_000)
  steps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20_000)
  elevationGainMetres?: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6000)
  route: Array<[number, number, number]>;
}

export class DailyStepsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  steps: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  distanceMetres?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  countedSteps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  countedMetres?: number;
}

export class DailyStepsSyncDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => DailyStepsDto)
  days: DailyStepsDto[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;
}

export class AppleHealthSettingsDto {
  @IsBoolean()
  shareSteps: boolean;
}
