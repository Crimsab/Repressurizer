import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import { DEFAULT_SESSION_PLANNER_CONFIG, type SessionPlannerConfig } from "../lib/sessionPlanner";
import { useEntityJournalStore } from "./entityJournalStore";

const STORAGE_KEY = "session-planner.json";
const SCHEMA_VERSION = 1;

export interface SessionPlannerPreset {
  id: string;
  name: string;
  config: SessionPlannerConfig;
  createdAt: number;
  updatedAt: number;
}

export type RecommendationHistoryAction = "recommended" | "launched" | "hidden" | "frequency" | "queued";
export interface RecommendationHistoryEntry {
  id: string;
  appId: number;
  action: RecommendationHistoryAction;
  at: number;
  durationMinutes: number;
  presetId: string | null;
}

export type TonightQueueItemStatus = "pending" | "skipped" | "completed" | "deferred";
export interface TonightQueueItem {
  appId: number;
  durationMinutes: number;
  status: TonightQueueItemStatus;
  addedAt: number;
}

export interface RecentTonightQueue {
  id: string;
  name: string;
  items: TonightQueueItem[];
  durationBudgetMinutes: number;
  savedAt: number;
}

interface PersistedSessionPlanner {
  version: number;
  config: SessionPlannerConfig;
  presets: SessionPlannerPreset[];
  hiddenUntil: Record<number, number>;
  permanentlySuppressed: number[];
  frequency: Record<number, number>;
  pinnedAppId: number | null;
  history: RecommendationHistoryEntry[];
  queue: TonightQueueItem[];
  recentQueues: RecentTonightQueue[];
}

interface SessionPlannerState extends PersistedSessionPlanner {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setConfig: (patch: Partial<SessionPlannerConfig>) => void;
  savePreset: (name: string) => string | null;
  loadPreset: (id: string) => void;
  removePreset: (id: string) => void;
  suppressToday: (appId: number) => void;
  suppressPermanently: (appId: number) => void;
  adjustFrequency: (appId: number, delta: -1 | 1) => void;
  pin: (appId: number | null) => void;
  logRecommendation: (appId: number, action: RecommendationHistoryAction, presetId?: string | null) => void;
  addToQueue: (appId: number, durationMinutes?: number) => boolean;
  removeFromQueue: (appId: number) => void;
  moveQueueItem: (appId: number, direction: -1 | 1) => void;
  reorderQueue: (appId: number, targetAppId: number) => void;
  setQueueDuration: (appId: number, minutes: number) => void;
  setQueueStatus: (appId: number, status: TonightQueueItemStatus) => void;
  saveCurrentQueue: (name: string) => string | null;
  resumeQueue: (id: string) => void;
  clearQueue: () => void;
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function persist(state: Pick<SessionPlannerState, "config" | "presets" | "hiddenUntil" | "permanentlySuppressed" | "frequency" | "pinnedAppId" | "history" | "queue" | "recentQueues">) {
  const payload: PersistedSessionPlanner = { version: SCHEMA_VERSION, ...state };
  void saveAppData(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
}

function stateData(state: SessionPlannerState) {
  return { config: state.config, presets: state.presets, hiddenUntil: state.hiddenUntil, permanentlySuppressed: state.permanentlySuppressed, frequency: state.frequency, pinnedAppId: state.pinnedAppId, history: state.history, queue: state.queue, recentQueues: state.recentQueues };
}

function parse(raw: string | null): PersistedSessionPlanner | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedSessionPlanner>;
    if (value.version !== SCHEMA_VERSION) return null;
    return {
      version: SCHEMA_VERSION,
      config: { ...DEFAULT_SESSION_PLANNER_CONFIG, ...(value.config ?? {}) },
      presets: Array.isArray(value.presets) ? value.presets.slice(0, 50) : [],
      hiddenUntil: value.hiddenUntil ?? {},
      permanentlySuppressed: Array.isArray(value.permanentlySuppressed) ? value.permanentlySuppressed : [],
      frequency: value.frequency ?? {},
      pinnedAppId: Number.isFinite(value.pinnedAppId) ? value.pinnedAppId! : null,
      history: Array.isArray(value.history) ? value.history.slice(0, 500) : [],
      queue: Array.isArray(value.queue) ? value.queue.slice(0, 30) : [],
      recentQueues: Array.isArray(value.recentQueues) ? value.recentQueues.slice(0, 20) : [],
    };
  } catch { return null; }
}

export const useSessionPlannerStore = create<SessionPlannerState>((set, get) => ({
  version: SCHEMA_VERSION,
  config: { ...DEFAULT_SESSION_PLANNER_CONFIG },
  presets: [], hiddenUntil: {}, permanentlySuppressed: [], frequency: {}, pinnedAppId: null, history: [], queue: [], recentQueues: [], hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    const loaded = parse(await loadAppData(STORAGE_KEY).catch(() => null));
    set(loaded ? { ...loaded, hydrated: true } : { hydrated: true });
  },
  setConfig: (patch) => set((state) => {
    const config = { ...state.config, ...patch };
    persist({ ...stateData(state), config });
    return { config };
  }),
  savePreset: (name) => {
    const trimmed = name.trim().slice(0, 80); if (!trimmed) return null;
    const state = get(); const now = Date.now(); const preset = { id: id("preset"), name: trimmed, config: structuredClone(state.config), createdAt: now, updatedAt: now };
    const presets = [preset, ...state.presets].slice(0, 50); persist({ ...stateData(state), presets }); set({ presets });
    useEntityJournalStore.getState().append({ entityType: "planner-preset", entityId: preset.id, operation: "create", value: preset });
    return preset.id;
  },
  loadPreset: (presetId) => { const preset = get().presets.find((item) => item.id === presetId); if (preset) get().setConfig(preset.config); },
  removePreset: (presetId) => set((state) => { const presets = state.presets.filter((item) => item.id !== presetId); persist({ ...stateData(state), presets }); useEntityJournalStore.getState().append({ entityType: "planner-preset", entityId: presetId, operation: "delete", value: null }); return { presets }; }),
  suppressToday: (appId) => set((state) => { const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0); const hiddenUntil = { ...state.hiddenUntil, [appId]: tomorrow.getTime() }; persist({ ...stateData(state), hiddenUntil }); return { hiddenUntil }; }),
  suppressPermanently: (appId) => set((state) => { const permanentlySuppressed = [...new Set([...state.permanentlySuppressed, appId])]; persist({ ...stateData(state), permanentlySuppressed }); return { permanentlySuppressed }; }),
  adjustFrequency: (appId, delta) => set((state) => { const frequency = { ...state.frequency, [appId]: Math.max(-2, Math.min(2, (state.frequency[appId] ?? 0) + delta)) }; persist({ ...stateData(state), frequency }); return { frequency }; }),
  pin: (appId) => set((state) => { persist({ ...stateData(state), pinnedAppId: appId }); return { pinnedAppId: appId }; }),
  logRecommendation: (appId, action, presetId = null) => set((state) => { const entry = { id: id("rec"), appId, action, at: Date.now(), durationMinutes: state.config.durationMinutes, presetId }; const history = [entry, ...state.history].slice(0, 500); persist({ ...stateData(state), history }); return { history }; }),
  addToQueue: (appId, durationMinutes) => { const state = get(); if (state.queue.some((item) => item.appId === appId)) return false; const queue = [...state.queue, { appId, durationMinutes: Math.max(5, Math.min(720, Math.trunc(durationMinutes ?? state.config.durationMinutes))), status: "pending" as const, addedAt: Date.now() }]; persist({ ...stateData(state), queue }); set({ queue }); get().logRecommendation(appId, "queued"); useEntityJournalStore.getState().append({ entityType: "tonight-queue", entityId: "current", operation: "update", value: queue }); return true; },
  removeFromQueue: (appId) => set((state) => { const queue = state.queue.filter((item) => item.appId !== appId); persist({ ...stateData(state), queue }); return { queue }; }),
  moveQueueItem: (appId, direction) => set((state) => { const index = state.queue.findIndex((item) => item.appId === appId); const target = index + direction; if (index < 0 || target < 0 || target >= state.queue.length) return state; const queue = [...state.queue]; [queue[index], queue[target]] = [queue[target], queue[index]]; persist({ ...stateData(state), queue }); return { queue }; }),
  reorderQueue: (appId, targetAppId) => set((state) => {
    const from = state.queue.findIndex((item) => item.appId === appId);
    const to = state.queue.findIndex((item) => item.appId === targetAppId);
    if (from < 0 || to < 0 || from === to) return state;
    const queue = [...state.queue];
    const [moved] = queue.splice(from, 1);
    queue.splice(to, 0, moved);
    persist({ ...stateData(state), queue });
    return { queue };
  }),
  setQueueDuration: (appId, minutes) => set((state) => { const queue = state.queue.map((item) => item.appId === appId ? { ...item, durationMinutes: Math.max(5, Math.min(720, Math.trunc(minutes))) } : item); persist({ ...stateData(state), queue }); return { queue }; }),
  setQueueStatus: (appId, status) => set((state) => { const queue = state.queue.map((item) => item.appId === appId ? { ...item, status } : item); persist({ ...stateData(state), queue }); return { queue }; }),
  saveCurrentQueue: (name) => { const state = get(); if (!state.queue.length) return null; const recent = { id: id("queue"), name: name.trim().slice(0, 80) || new Date().toLocaleDateString(), items: structuredClone(state.queue), durationBudgetMinutes: state.config.durationMinutes, savedAt: Date.now() }; const recentQueues = [recent, ...state.recentQueues].slice(0, 20); persist({ ...stateData(state), recentQueues }); set({ recentQueues }); return recent.id; },
  resumeQueue: (queueId) => { const state = get(); const recent = state.recentQueues.find((item) => item.id === queueId); if (!recent) return; const queue = structuredClone(recent.items); persist({ ...stateData(state), queue }); set({ queue }); },
  clearQueue: () => {
    if (get().queue.length) get().saveCurrentQueue("Recent session");
    const state = get();
    const queue: TonightQueueItem[] = [];
    persist({ ...stateData(state), queue });
    set({ queue });
  },
}));
