import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateFeedPostDto {
  @IsOptional() @IsString() @MaxLength(500)
  body?: string;

  @IsOptional() @IsUUID()
  activityId?: string;

  /** A URL returned by POST /feed/images. */
  @IsOptional() @IsString() @MaxLength(400)
  imageUrl?: string;
}
