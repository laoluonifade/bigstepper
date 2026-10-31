import { Global, Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
@Global()
@Module({ providers: [EngagementService], exports: [EngagementService] })
export class EngagementModule {}
