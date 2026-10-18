import { IsIn, IsString, Length } from 'class-validator';

export class ResolveReviewDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  @IsString()
  @Length(5, 500)
  note: string;
}
