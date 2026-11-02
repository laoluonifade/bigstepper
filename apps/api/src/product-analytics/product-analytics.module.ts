import {
  Body,
  Controller,
  Global,
  Module,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { randomUUID } from "node:crypto";
import { CurrentUser, AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProductAnalyticsService } from "./product-analytics.service";
export class ScreenDto {
  @IsIn([
    "home",
    "event_list",
    "event_detail",
    "club_list",
    "club_detail",
    "competition_list",
    "competition_detail",
    "activity",
    "business",
    "guides",
  ])
  screen: string;
  @IsIn(["web", "ios", "android"]) platform: "web" | "ios" | "android";
  @IsOptional()
  @IsIn([
    "google",
    "bing",
    "duckduckgo",
    "yahoo",
    "chatgpt",
    "perplexity",
    "gemini",
    "copilot",
    "claude",
  ])
  source?: string;
}
@Controller("product-analytics")
@UseGuards(JwtAuthGuard)
export class ProductAnalyticsController {
  constructor(private readonly analytics: ProductAnalyticsService) {}
  @Post("screen")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  screen(@CurrentUser() user: AuthenticatedUser, @Body() body: ScreenDto) {
    this.analytics.track(user.id, "Screen Viewed", randomUUID(), new Date(), {
      screen: body.screen,
      platform: body.platform,
      source: body.source,
    });
    return { accepted: true };
  }
}
@Global()
@Module({
  providers: [ProductAnalyticsService],
  controllers: [ProductAnalyticsController],
  exports: [ProductAnalyticsService],
})
export class ProductAnalyticsModule {}
