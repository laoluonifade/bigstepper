import { IsString, Length } from 'class-validator';

export class RequestReviewDto {
  @IsString()
  @Length(10, 500)
  reason: string;
}
