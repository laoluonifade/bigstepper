import { useEffect, useRef } from "react";
import { usePathname } from "expo-router";
import { AppState, Platform } from "react-native";
import { productScreen } from "@jump/shared/product-analytics";
import { post } from "@/lib/api";
/** Mounted inside the authenticated layout. No native SDK, replay or health payloads. */
export function ProductAnalytics() {
  const path = usePathname();
  const last = useRef("");
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED !== "true") return;
    const send = () => {
      if (
        AppState.currentState !== "active" ||
        !["ios", "android"].includes(Platform.OS)
      )
        return;
      const screen = productScreen(path);
      if (!screen) return;
      void post("/product-analytics/screen", {
        screen,
        platform: Platform.OS === "ios" ? "ios" : "android",
      }).catch(() => undefined);
    };
    if (last.current !== path) {
      last.current = path;
      send();
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") send();
    });
    return () => subscription.remove();
  }, [path]);
  return null;
}
