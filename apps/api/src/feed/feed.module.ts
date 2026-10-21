import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({ controllers: [FeedController, MessagesController], providers: [FeedService, MessagesService] })
export class FeedModule {}
