import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

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
}
