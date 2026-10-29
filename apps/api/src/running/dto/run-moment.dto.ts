import { IsBoolean, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class RunMomentDto {
  @IsOptional()
  @IsISO8601()
  at?: string;
}

export class FinishRunDto extends RunMomentDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  sampleCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000)
  distanceMetres?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  steps?: number;

  @IsOptional()
  @IsBoolean()
  deferred?: boolean;
}
