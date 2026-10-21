import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class ReactToPostDto {
  @IsIn(['LIKE', 'FIRE', 'CLAP', 'HEART'])
  reaction: 'LIKE' | 'FIRE' | 'CLAP' | 'HEART';
}

export class WriteCommentDto {
  @IsString() @MinLength(1) @MaxLength(500)
  body: string;
}
