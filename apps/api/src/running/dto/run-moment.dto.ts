import { IsISO8601, IsOptional } from 'class-validator';

export class RunMomentDto {
  @IsOptional()
  @IsISO8601()
  at?: string;
}
