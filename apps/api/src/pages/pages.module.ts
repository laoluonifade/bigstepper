import {
  SeoAnalyticsController,
  SeoReportingController,
} from './seo-analytics.controller';
import { SeoAnalyticsService } from './seo-analytics.service';
import { Global, Module } from '@nestjs/common';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

@Global()
@Module({
  controllers: [
    PagesController,
    SeoAnalyticsController,
    SeoReportingController,
  ],
  providers: [PagesService, SeoAnalyticsService],
  exports: [SeoAnalyticsService],
})
export class PagesModule {}
