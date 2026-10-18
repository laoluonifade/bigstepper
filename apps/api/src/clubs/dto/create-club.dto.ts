import { IsString, Length, Matches } from 'class-validator';

export class CreateClubDto {
  @IsString()
  @Length(3, 100)
  name: string;

  @IsString()
  @Length(3, 40)
  @Matches(/^[a-z0-9-]+$/)
  slug: string;
}
