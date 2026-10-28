import { Module } from '@nestjs/common';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { ClubChatController, GroupChatController, MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({ controllers: [FeedController, MessagesController, ClubChatController, GroupChatController], providers: [FeedService, MessagesService, CloudinaryService] })
export class FeedModule {}
