import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  ProductAnalyticsController,
  ScreenDto,
} from "./product-analytics.module";
import { ProductAnalyticsService } from "./product-analytics.service";
import { validateEnvironment } from "../config/environment";
function setup(enabled = true, region = "EU") {
  const values: Record<string, unknown> = {
    MIXPANEL_ENABLED: enabled,
    MIXPANEL_REGION: region,
    MIXPANEL_PROJECT_TOKEN: "test-only-token",
    MIXPANEL_ID_SALT: "a-dedicated-test-secret-with-more-than-32-chars",
    NODE_ENV: "test",
  };
  return new ProductAnalyticsService({
    get: (key: string) => values[key],
  } as never);
}
const at = new Date("2026-11-02T12:00:00Z");
describe("Mixpanel delivery and privacy", () => {
  const original = global.fetch;
  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 1 }) });
  });
  afterEach(() => {
    global.fetch = original;
  });
  it("does not send data unless explicitly enabled", async () => {
    const service = setup(false);
    service.track("real-user", "Account Created", "account", at);
    await service.onModuleDestroy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("pseudonymizes identities and keys, sends to the selected region and disables IP inference", async () => {
    const service = setup();
    service.track("real-user", "Account Created", "real-account", at);
    await service.onModuleDestroy();
    const [url, request] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api-eu.mixpanel.com/track?ip=0&verbose=1");
    const [{ event, properties }] = JSON.parse(request.body);
    expect(event).toBe("Account Created");
    expect(properties.distinct_id).toMatch(/^[a-f0-9]{64}$/);
    expect(properties.$user_id).toBe(properties.distinct_id);
    expect(properties.ip).toBe("0");
    expect(properties.environment).toBe("development");
    expect(request.body).not.toContain("real-user");
    expect(request.body).not.toContain("real-account");
    expect(properties.time).toBe(at.getTime() / 1000);
  });
  it("drops unapproved fields even if a caller passes a full health/profile object", async () => {
    const service = setup();
    service.track("user", "Screen Viewed", "view", at, {
      screen: "event_detail",
      platform: "ios",
      source: "chatgpt",
      email: "private@example.test",
      steps: 12345,
      route: [[6, 3]],
      url: "/passes/private",
    } as never);
    await service.onModuleDestroy();
    const [{ properties }] = JSON.parse(
      (fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(properties).toMatchObject({
      screen: "event_detail",
      platform: "ios",
      source: "chatgpt",
    });
    for (const key of ["email", "steps", "route", "url"])
      expect(properties[key]).toBeUndefined();
  });
  it("drops arbitrary source and screen values", async () => {
    const service = setup();
    service.track("user", "Screen Viewed", "view", at, {
      screen: "/messages/private",
      source: "secret query",
    });
    await service.onModuleDestroy();
    const [{ properties }] = JSON.parse(
      (fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(properties.screen).toBeUndefined();
    expect(properties.source).toBeUndefined();
  });
  it("keeps stable identity and insertion keys for the same occurrence", async () => {
    const service = setup();
    for (let i = 0; i < 2; i++)
      service.track("user", "Pass Issued", "pass", at);
    await service.onModuleDestroy();
    const values = (fetch as jest.Mock).mock.calls.map(
      ([, r]) => JSON.parse(r.body)[0].properties,
    );
    expect(values[0]).toEqual(values[1]);
  });
  it("swallows rejected deliveries and bounds concurrency", async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error("provider down"));
    const service = setup();
    expect(() =>
      service.track("user", "Club Joined", "club", at),
    ).not.toThrow();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    let resolve: (value: unknown) => void = () => undefined;
    (fetch as jest.Mock).mockReset().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const bounded = setup();
    for (let i = 0; i < 40; i++)
      bounded.track("user", "Screen Viewed", String(i), at);
    expect(fetch).toHaveBeenCalledTimes(32);
    resolve({ ok: true, json: async () => ({ status: 1 }) });
    await bounded.onModuleDestroy();
  });
  it("fails configuration closed and stays disabled by default", () => {
    expect(validateEnvironment({}).MIXPANEL_ENABLED).toBe(false);
    expect(() => validateEnvironment({ MIXPANEL_ENABLED: "true" })).toThrow(
      "Mixpanel requires",
    );
    expect(() => validateEnvironment({ MIXPANEL_REGION: "elsewhere" })).toThrow(
      "MIXPANEL_REGION",
    );
  });
});

describe("authenticated screen collection", () => {
  it("requires JWT and uses the authenticated identity with projected properties", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ProductAnalyticsController),
    ).toContain(JwtAuthGuard);
    const analytics = { track: jest.fn() };
    const controller = new ProductAnalyticsController(analytics as never);
    controller.screen(
      { id: "authenticated-user" } as never,
      {
        screen: "home",
        platform: "ios",
        userId: "spoofed-user",
        steps: 1234,
      } as never,
    );
    expect(analytics.track).toHaveBeenCalledWith(
      "authenticated-user",
      "Screen Viewed",
      expect.any(String),
      expect.any(Date),
      { screen: "home", platform: "ios", source: undefined },
    );
  });
  it("rejects arbitrary screen/source/platform and strips unexpected fields through validation", async () => {
    const bad = plainToInstance(ScreenDto, {
      screen: "/private/token",
      platform: "anything",
      source: "raw private URL",
    });
    expect(await validate(bad, { whitelist: true })).toHaveLength(3);
    const valid = plainToInstance(ScreenDto, {
      screen: "home",
      platform: "android",
      email: "private@example.test",
      steps: 10,
    });
    expect(await validate(valid, { whitelist: true })).toHaveLength(0);
    expect(valid).toEqual({ screen: "home", platform: "android" });
  });
});
