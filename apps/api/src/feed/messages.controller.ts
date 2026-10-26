import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';
import { Reaction, REACTIONS } from './reactions';

const VOICE_NOTE_MAX_BYTES = 5 * 1024 * 1024;

export class SendMessageDto {
  @IsString() @MaxLength(1000)
  body: string;

  @IsOptional() @IsUUID()
  replyToId?: string;

  @IsOptional() @IsUUID()
  activityId?: string;

  @IsOptional() @IsString() @MaxLength(400)
  audioUrl?: string;

  @IsOptional() @IsInt() @Min(1) @Max(120)
  audioSeconds?: number;
}

class ReactToMessageDto {
  @IsIn(REACTIONS)
  reaction: Reaction;
}

class EditMessageDto {
  @IsString() @MinLength(1) @MaxLength(1000)
  body: string;
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  inbox(@CurrentUser() user: AuthenticatedUser) { return this.messages.inbox(user.id); }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) { return this.messages.unreadCount(user.id); }

  @Post(':id/reaction')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  react(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() input: ReactToMessageDto) {
    return this.messages.react(user.id, id, input.reaction);
  }

  @Delete(':id/reaction')
  unreact(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.react(user.id, id, null);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  edit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() input: EditMessageDto) {
    return this.messages.edit(user.id, id, input.body);
  }

  @Get(':username')
  conversation(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.messages.conversation(user.id, username);
  }

  @Post(':username/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.messages.markRead(user.id, username);
  }

  @Post('voice')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: VOICE_NOTE_MAX_BYTES, files: 1 } }))
  uploadVoiceNote(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.messages.uploadVoiceNote(user.id, file);
  }

  @Post(':username')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  send(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string, @Body() input: SendMessageDto) {
    const { body, ...extras } = input;
    return this.messages.send(user.id, username, body, extras);
  }
}

@Controller('clubs/:club/chat')
@UseGuards(JwtAuthGuard)
export class ClubChatController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  conversation(@CurrentUser() user: AuthenticatedUser, @Param('club') club: string) {
    return this.messages.clubConversation(user.id, club);
  }

  @Post('read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('club') club: string) {
    return this.messages.markClubRead(user.id, club);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  send(@CurrentUser() user: AuthenticatedUser, @Param('club') club: string, @Body() input: SendMessageDto) {
    const { body, ...extras } = input;
    return this.messages.sendToClub(user.id, club, body, extras);
  }
}
