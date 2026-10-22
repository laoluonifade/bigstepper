import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Reaction, REACTIONS } from './reactions';

export class ReactToPostDto {
  @IsIn(REACTIONS)
  reaction: Reaction;
}

export class WriteCommentDto {
  @IsString() @MinLength(1) @MaxLength(500)
  body: string;
}
