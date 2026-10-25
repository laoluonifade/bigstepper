import { IsISO8601, IsOptional } from 'class-validator';

/** When a pause, resume or finish happened on the phone, if it was done offline and is arriving late. */
export class RunMomentDto {
  @IsOptional()
  @IsISO8601()
  at?: string;
}
