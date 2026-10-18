import { IsIn, IsOptional } from 'class-validator';

export class StartRunDto {
  @IsOptional()
  @IsIn(['walk', 'run'])
  activityType?: 'walk' | 'run';
}
