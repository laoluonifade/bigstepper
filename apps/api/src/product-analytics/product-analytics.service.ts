import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";

export const PRODUCT_EVENTS = [
  "Account Created",
  "Screen Viewed",
  "Club Joined",
  "Pass Issued",
  "Competition Joined",
  "Activity Saved",
  "Apple Health Connected",
  "Apple Health Sync Succeeded",
] as const;
export type ProductEvent = (typeof PRODUCT_EVENTS)[number];
export type ProductProperties = {
  platform?: "web" | "ios" | "android" | "server";
  screen?: string;
  source?: string;
};
const SCREENS = [
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
];
const SOURCES = [
  "google",
  "bing",
  "duckduckgo",
  "yahoo",
  "chatgpt",
  "perplexity",
  "gemini",
  "copilot",
  "claude",
];
@Injectable()
export class ProductAnalyticsService implements OnModuleDestroy {
  private readonly pending = new Set<Promise<void>>();
  private readonly logger = new Logger(ProductAnalyticsService.name);
  constructor(private readonly config: ConfigService) {}
  /** Best effort after domain work commits. Never serialize a request, profile or activity object. */
  track(
    userId: string,
    event: ProductEvent,
    key: string,
    at: Date = new Date(),
    properties: ProductProperties = {},
  ) {
    try {
      if (
        this.config.get<boolean>("MIXPANEL_ENABLED") !== true ||
        this.pending.size >= 32 ||
        !userId ||
        !PRODUCT_EVENTS.includes(event)
      )
        return;
      const token = this.config.get<string>("MIXPANEL_PROJECT_TOKEN");
      const salt = this.config.get<string>("MIXPANEL_ID_SALT");
      if (!token || !salt || salt.length < 32 || !Number.isFinite(at.getTime()))
        return;
      const hash = (value: string) =>
        createHmac("sha256", salt).update(value).digest("hex");
      const identity = hash("user:" + userId);
      const clean: Record<string, string> = {};
      if (
        ["web", "ios", "android", "server"].includes(properties.platform ?? "")
      )
        clean.platform = properties.platform!;
      if (SCREENS.includes(properties.screen ?? ""))
        clean.screen = properties.screen!;
      if (SOURCES.includes(properties.source ?? ""))
        clean.source = properties.source!;
      const host =
        this.config.get<string>("MIXPANEL_REGION") === "US"
          ? "https://api.mixpanel.com"
          : "https://api-eu.mixpanel.com";
      const payload = [
        {
          event,
          properties: {
            ...clean,
            token,
            distinct_id: identity,
            $user_id: identity,
            $insert_id: hash(event + ":" + key),
            time: Math.floor(at.getTime() / 1000),
            environment:
              this.config.get<string>("NODE_ENV") === "production"
                ? "production"
                : "development",
            ip: "0",
          },
        },
      ];
      const task = fetch(host + "/track?ip=0&verbose=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2000),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("rejected");
          const result = (await response.json()) as { status?: number };
          if (result.status !== 1) throw new Error("rejected");
        })
        .catch(() => {
          this.logger.warn("A product analytics event was not delivered");
        });
      this.pending.add(task);
      void task.finally(() => this.pending.delete(task));
    } catch {
      /* Analytics must not fail a product operation. */
    }
  }
  async onModuleDestroy() {
    await Promise.allSettled([...this.pending]);
  }
}
