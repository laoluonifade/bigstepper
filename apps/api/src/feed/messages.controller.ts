import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';

class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(1000)
  body: string;

  @IsOptional() @IsUUID()
  replyToId?: string;
}

class ReactToMessageDto {
  @IsIn(['LIKE', 'HEART', 'LAUGH', 'FIRE', 'CLAP'])
  reaction: 'LIKE' | 'HEART' | 'LAUGH' | 'FIRE' | 'CLAP';
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

  @Get(':username')
  conversation(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.messages.conversation(user.id, username);
  }

  @Post(':username/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.messages.markRead(user.id, username);
  }

  @Post(':username')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  send(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string, @Body() input: SendMessageDto) {
    return this.messages.send(user.id, username, input.body, input.replyToId);
  }
}
