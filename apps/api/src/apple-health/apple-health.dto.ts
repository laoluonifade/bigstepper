import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

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
