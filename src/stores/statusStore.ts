import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type GameStatus = "none" | "playing" | "beaten" | "completed" | "abandoned";

export const STATUS_META: Record<GameStatus, { label: string; color: string; bg: string }> = {
  none:      { label: "",          color: "",                     bg: "" },
  playing:   { label: "Playing",   color: "text-sky-400",         bg: "bg-sky-400/15" },
  beaten:    { label: "Beaten",    color: "text-violet-400",      bg: "bg-violet-400/15" },
  completed: { label: "Completed", color: "text-repressurizer-accent",    bg: "bg-repressurizer-accent/15" },
  abandoned: { label: "Abandoned", color: "text-repressurizer-text-faint", bg: "bg-repressurizer-surface-hover" },
};

const STORAGE_KEY = "repressurizer-game-status";

function loadStatuses(): Record<number, GameStatus> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStatuses(statuses: Record<number, GameStatus>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
  } catch {}
  invoke("save_app_data", { key: "statuses.json", data: JSON.stringify(statuses) }).catch(() => {});
}

interface StatusState {
  statuses: Record<number, GameStatus>;
  setStatus: (appId: number, status: GameStatus) => void;
  getStatus: (appId: number) => GameStatus;
  hydrate: () => Promise<void>;
}

export const useStatusStore = create<StatusState>((set, get) => ({
  statuses: loadStatuses(),

  setStatus: (appId, status) =>
    set((state) => {
      const next = { ...state.statuses };
      if (status === "none") {
        delete next[appId];
      } else {
        next[appId] = status;
      }
      saveStatuses(next);
      return { statuses: next };
    }),

  getStatus: (appId) => get().statuses[appId] ?? "none",

  hydrate: async () => {
    try {
      const raw = await invoke<string | null>("load_app_data", { key: "statuses.json" });
      if (raw) {
        const parsed: Record<number, GameStatus> = JSON.parse(raw);
        const local = get().statuses;
        const merged = { ...local, ...parsed };
        set({ statuses: merged });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    } catch {}
  },
}));
