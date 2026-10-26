import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AVATAR_MAX_BYTES } from '../profiles/profiles.service';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateFeedPostDto } from './create-feed-post.dto';
import { FeedService } from './feed.service';
import { ReactToPostDto, WriteCommentDto } from './feed-interaction.dto';

@Controller('feed')
@UseGuards(JwtAuthGuard)
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('scope') scope?: string, @Query('page') page?: string) {
    return this.feed.list(user.id, scope, page);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateFeedPostDto) {
    return this.feed.create(user.id, input);
  }

  @Post('images')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  uploadImage(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.feed.uploadImage(user.id, file);
  }

  @Get(':id')
  post(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.feed.post(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.feed.remove(user.id, id);
  }

  @Post(':id/reaction')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  react(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() input: ReactToPostDto) {
    return this.feed.react(user.id, id, input.reaction);
  }

  @Delete(':id/reaction')
  unreact(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.feed.unreact(user.id, id);
  }

  @Get(':id/comments')
  comments(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.feed.comments(user.id, id);
  }

  @Post(':id/comments')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  comment(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() input: WriteCommentDto) {
    return this.feed.comment(user.id, id, input.body);
  }

  @Delete('comments/:id')
  removeComment(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.feed.removeComment(user.id, id);
  }
}
