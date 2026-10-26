import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateFeedPostDto {
  @IsOptional() @IsString() @MaxLength(500)
  body?: string;

  @IsOptional() @IsUUID()
  activityId?: string;

  @IsOptional() @IsString() @MaxLength(400)
  imageUrl?: string;
}
