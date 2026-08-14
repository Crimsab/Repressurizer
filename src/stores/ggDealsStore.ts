import { create } from "zustand";
import {
  GG_DEALS_REQUEST_INTERVAL_MS,
  isFreshGgDealsRecord,
  type GgDealsCacheRecord,
} from "../lib/ggDeals";
import { fetchGgDealsPrice } from "../lib/tauri";
import type { GgDealsPrice } from "../lib/types";

const STORAGE_KEY = "repressurizer-gg-deals-cache-v1";
const inFlight = new Map<number, Promise<void>>();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

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

function loadCache(): Record<number, GgDealsCacheRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<number, GgDealsCacheRecord>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, record]) =>
        record && Number.isFinite(record.fetchedAt) && record.fetchedAt > 0 && isCachedData(record.data)
      )
    );
  } catch {
    return {};
  }
}

function persist(records: Record<number, GgDealsCacheRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

interface GgDealsState {
  records: Record<number, GgDealsCacheRecord>;
  loading: Record<number, boolean>;
  errors: Record<number, string>;
  fetchPrice: (
    appId: number,
    apiKey: string,
    region: string,
    force?: boolean
  ) => Promise<void>;
  clear: () => void;
}

export const useGgDealsStore = create<GgDealsState>((set, get) => ({
  records: loadCache(),
  loading: {},
  errors: {},

  fetchPrice: async (appId, apiKey, region, force = false) => {
    if (!force && isFreshGgDealsRecord(get().records[appId])) return;
    const existing = inFlight.get(appId);
    if (existing) return existing;

    const request = (async () => {
      set((state) => ({
        loading: { ...state.loading, [appId]: true },
        errors: { ...state.errors, [appId]: "" },
      }));
      try {
        await waitForRequestSlot();
        const data = await fetchGgDealsPrice(appId, apiKey, region);
        if (!isCachedData(data)) throw new Error("GG.deals returned invalid price data");
        set((state) => {
          const records = { ...state.records, [appId]: { data, fetchedAt: Date.now() } };
          persist(records);
          return { records };
        });
      } catch (error) {
        set((state) => ({
          errors: { ...state.errors, [appId]: String(error) },
        }));
      } finally {
        set((state) => ({ loading: { ...state.loading, [appId]: false } }));
      }
    })();

    inFlight.set(appId, request);
    try {
      await request;
    } finally {
      inFlight.delete(appId);
    }
  },

  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    set({ records: {}, loading: {}, errors: {} });
  },
}));
