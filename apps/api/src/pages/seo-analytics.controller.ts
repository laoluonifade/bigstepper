import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnlyGuard } from '../admin/admin-only.guard';
import { PagesService } from './pages.service';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';
import { SeoAnalyticsService } from './seo-analytics.service';
class LandingDto {
  @IsUUID('4') session: string;
  @IsIn(['google', 'bing', 'duckduckgo', 'yahoo']) source: string;
  @IsString() @MaxLength(240) landing: string;
}
class ActionDto {
  @IsString() @MaxLength(1200) token: string;
  @IsIn(['cta_click', 'business_contact_click']) kind: string;
}
@Controller('pages/acquisition')
export class SeoAnalyticsController {
  constructor(private readonly analytics: SeoAnalyticsService) {}
  @Post() @Throttle({ default: { limit: 20, ttl: 60_000 } }) landing(
    @Body() body: LandingDto,
  ) {
    return this.analytics.landing(body.session, body.source, body.landing);
  }
  @Post('action') @Throttle({ default: { limit: 30, ttl: 60_000 } }) action(
    @Body() body: ActionDto,
  ) {
    return this.analytics.clientEvent(body.token, body.kind);
  }
}

@Controller('admin/seo')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class SeoReportingController {
  constructor(
    private readonly db: DataSource,
    private readonly pages: PagesService,
  ) {}
  @Get('performance') async report() {
    const [eligible, conversions] = await Promise.all([
      this.pages.sitemapCounts(),
      this.db.query(
        `SELECT date_trunc('day',"createdAt") AS day,source,landing,kind,count(*)::int AS count FROM organic_acquisition_events WHERE "createdAt">now()-interval '30 days' GROUP BY day,source,landing,kind ORDER BY day DESC LIMIT 1000`,
      ),
    ]);
    return {
      eligiblePublicRecords: eligible,
      conversions,
      searchEngineMetrics: {
        indexedPages: null,
        impressions: null,
        clicks: null,
        ctr: null,
      },
      notes: [
        'Eligible public records are not confirmed indexed pages. Connect Search Console and Bing reports for index coverage and search performance.',
        'Business contact clicks measure intent, not confirmed delivered inquiries.',
      ],
    };
  }
}
