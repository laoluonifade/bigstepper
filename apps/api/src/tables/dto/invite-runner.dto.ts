import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class InviteRunnerDto {
  @IsString() @MinLength(2) @MaxLength(32) @Matches(/^[a-zA-Z0-9_]+$/)
  username: string;
}
