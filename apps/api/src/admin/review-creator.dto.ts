import { IsIn } from 'class-validator';

export class ReviewCreatorDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';
}
