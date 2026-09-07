import { create } from "zustand";
import {
  GG_DEALS_REQUEST_INTERVAL_MS,
  isFreshGgDealsRecord,
  type GgDealsCacheRecord,
} from "../lib/ggDeals";
import { fetchGgDealsPrice } from "../lib/tauri";
import type { GgDealsPrice } from "../lib/types";

const STORAGE_KEY = "repressurizer-gg-deals-cache-v1";
const inFlight = new Map<string, Promise<void>>();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

export function ggDealsCacheKey(appId: number, region: string): string {
  return `${Math.trunc(appId)}:${region.trim().toLowerCase()}`;
}

function isPrice(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000);
}

function isCachedData(value: unknown): value is GgDealsPrice | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<GgDealsPrice>;
  return Number.isInteger(data.appId) && Number(data.appId) > 0
    && (data.url === null || typeof data.url === "string")
    && typeof data.currency === "string" && data.currency.length <= 12
    && isPrice(data.currentRetail)
    && isPrice(data.currentKeyshops)
    && isPrice(data.historicalRetail)
    && isPrice(data.historicalKeyshops);
}

async function waitForRequestSlot() {
  let release = () => {};
  const previous = requestQueue;
  requestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const waitMs = Math.max(0, GG_DEALS_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();
  } finally {
    release();
  }
}

function loadCache(): Record<string, GgDealsCacheRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, GgDealsCacheRecord>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, record]) =>
        /^\d+:[a-z]{2}$/.test(key)
        && record
        && Number.isFinite(record.fetchedAt)
        && record.fetchedAt > 0
        && isCachedData(record.data)
      )
    );
  } catch {
    return {};
  }
}

function persist(records: Record<string, GgDealsCacheRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

interface GgDealsState {
  /** Records are keyed by `${appId}:${countryCode}` to prevent region reuse. */
  records: Record<string, GgDealsCacheRecord>;
  loading: Record<string, boolean>;
  errors: Record<string, string>;
  fetchPrice: (
    appId: number,
    apiKey: string,
    region: string | null,
    force?: boolean
  ) => Promise<void>;
  clear: () => void;
}

export const useGgDealsStore = create<GgDealsState>((set, get) => ({
  records: loadCache(),
  loading: {},
  errors: {},

  fetchPrice: async (appId, apiKey, region, force = false) => {
    const normalizedRegion = typeof region === "string" ? region.trim().toLowerCase() : "";
    const key = normalizedRegion ? ggDealsCacheKey(appId, normalizedRegion) : ggDealsCacheKey(appId, "??");
    if (!normalizedRegion) {
      set((state) => ({ errors: { ...state.errors, [key]: "GG.deals does not support the selected Store market" } }));
      return;
    }
    if (!force && isFreshGgDealsRecord(get().records[key])) return;
    const existing = inFlight.get(key);
    if (existing) return existing;

    const request = (async () => {
      set((state) => ({
        loading: { ...state.loading, [key]: true },
        errors: { ...state.errors, [key]: "" },
      }));
      try {
        await waitForRequestSlot();
        const data = await fetchGgDealsPrice(appId, apiKey, normalizedRegion);
        if (!isCachedData(data)) throw new Error("GG.deals returned invalid price data");
        set((state) => {
          const records = { ...state.records, [key]: { data, fetchedAt: Date.now() } };
          persist(records);
          return { records };
        });
      } catch (error) {
        set((state) => ({
          errors: { ...state.errors, [key]: String(error) },
        }));
      } finally {
        set((state) => ({ loading: { ...state.loading, [key]: false } }));
      }
    })();

    inFlight.set(key, request);
    try {
      await request;
    } finally {
      inFlight.delete(key);
    }
  },

  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    set({ records: {}, loading: {}, errors: {} });
  },
}));
