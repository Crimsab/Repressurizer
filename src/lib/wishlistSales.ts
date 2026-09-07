import { notifyDesktop } from "./desktopNotifications";
import { t } from "./i18n";
import { priceSnapshotForCurrency } from "./prices";
import { useGameStore } from "../stores/gameStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useWishlistStore } from "../stores/wishlistStore";

export function wishlistPriceSnapshot(appId: number) {
  const state = useGameStore.getState();
  const settings = useSettingsStore.getState();
  return priceSnapshotForCurrency(state.details[appId], settings.currency, settings.storeCountryCode);
}

export function wishlistDiscountPercent(appId: number): number {
  const price = wishlistPriceSnapshot(appId);
  if (!price?.price_initial || price.price_final == null || price.price_initial <= price.price_final) return 0;
  return Math.round(((price.price_initial - price.price_final) / price.price_initial) * 100);
}

export function wishlistFinalPrice(appId: number): number | null {
  const price = wishlistPriceSnapshot(appId);
  if (price?.price_final == null) return null;
  return price.price_final / 100;
}

function ruleTriggered(appId: number, rule: { mode: "off" | "percent" | "price"; value: number } | undefined, defaultThreshold: number): boolean {
  if (rule?.mode === "off") return false;
  if (rule?.mode === "price") {
    const finalPrice = wishlistFinalPrice(appId);
    return finalPrice != null && finalPrice <= rule.value;
  }
  const threshold = rule?.mode === "percent" ? rule.value : defaultThreshold;
  return wishlistDiscountPercent(appId) >= threshold;
}

export async function checkWishlistSales(): Promise<number> {
  const settings = useSettingsStore.getState();
  if (!settings.saleNotifyEnabled || !settings.desktopNotifications) return 0;
  const items = useWishlistStore.getState().items;
  if (items.length === 0) return 0;
  const details = useGameStore.getState().details;
  const rules = settings.saleAlertRules;
  const notified = { ...settings.saleNotifiedSales };
  let changed = false;
  const alerts: string[] = [];
  for (const item of items) {
    const key = String(item.appid);
    const rule = rules[key];
    const triggered = ruleTriggered(item.appid, rule, settings.saleNotifyThreshold);
    const discount = wishlistDiscountPercent(item.appid);
    if (triggered) {
      if (notified[key] !== discount) {
        notified[key] = discount;
        changed = true;
        alerts.push(t("wishlist.notify.alert", { name: String(details[item.appid]?.name ?? `App ${item.appid}`), discount }));
      }
    } else if (notified[key] !== undefined) {
      delete notified[key];
      changed = true;
    }
  }
  if (changed) useSettingsStore.getState().setSettings({ saleNotifiedSales: notified });
  if (alerts.length === 0) return 0;
  await notifyDesktop({
    title: t("wishlist.notify.title"),
    body: alerts.slice(0, 5).join(" · "),
  });
  return alerts.length;
}
