import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class StartRunDto {
  @IsOptional()
  @IsIn(['walk', 'run', 'cycle'])
  activityType?: 'walk' | 'run' | 'cycle';

  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsISO8601()
  startedAt?: string;
}
