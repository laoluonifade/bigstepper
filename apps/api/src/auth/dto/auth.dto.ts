import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 72)
  password: string;
}

export class RegisterDto extends LoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}
