import { IsEmail, IsString, Length } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  email: string;
}

export class CompletePasswordResetDto {
  @IsString()
  @Length(40, 200)
  token: string;

  @IsString()
  @Length(8, 72)
  password: string;
}

export class VerifyEmailDto {
  @IsString()
  @Length(40, 200)
  token: string;
}
