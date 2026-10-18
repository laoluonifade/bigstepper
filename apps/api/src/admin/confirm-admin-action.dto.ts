import { IsString, Length } from 'class-validator';

export class ConfirmAdminActionDto {
  @IsString()
  @Length(8, 72)
  password: string;
}
