import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import type { DiaryBoardPrefs, DiaryBulkSnapshot } from "./diaryStore";
import type { GameStatus } from "./statusStore";

export interface DiaryActionSnapshot {
  diary: DiaryBulkSnapshot;
  statuses: Record<number, GameStatus | undefined>;
  boardPrefs: DiaryBoardPrefs;
}

export interface DiaryActionHistoryEntry {
  id: string;
  label: string;
  count: number;
  createdAt: number;
  snapshot: DiaryActionSnapshot;
}

/**
 * Normalize a snapshot before it is written to localStorage/app-data.
 * JSON drops undefined object values, so explicit nulls are used for
 * "there was no value" and are understood by the Diary restore methods.
 */
export function makeDiaryActionSnapshot(
  appIds: number[],
  diary: DiaryBulkSnapshot,
  statuses: Record<number, GameStatus | undefined>,
  boardPrefs: DiaryBoardPrefs,
): DiaryActionSnapshot {
  const ids = [...new Set(appIds.filter((appId) => Number.isFinite(appId)).map((appId) => Math.trunc(appId)))];
  return {
    diary: {
      ...diary,
      entries: Object.fromEntries(ids.map((appId) => [appId, diary.entries[appId] ?? null])) as DiaryBulkSnapshot["entries"],
      board: Object.fromEntries(ids.map((appId) => [appId, diary.board[appId] ?? null])) as DiaryBulkSnapshot["board"],
      customAssignments: Object.fromEntries(ids.map((appId) => [appId, diary.customAssignments[appId] ?? null])) as DiaryBulkSnapshot["customAssignments"],
    },
    statuses: Object.fromEntries(ids.map((appId) => [appId, statuses[appId] ?? null])) as DiaryActionSnapshot["statuses"],
    boardPrefs: {
      columnColors: { ...boardPrefs.columnColors },
      hiddenColumns: [...boardPrefs.hiddenColumns],
      customColumns: boardPrefs.customColumns.map((column) => ({ ...column })),
      columnOrder: [...boardPrefs.columnOrder],
      customAssignments: { ...boardPrefs.customAssignments },
      removedAppIds: [...boardPrefs.removedAppIds],
    },
  };
}

interface DiaryActionHistoryState {
  entries: DiaryActionHistoryEntry[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  push: (entry: Omit<DiaryActionHistoryEntry, "id" | "createdAt">) => string;
  remove: (id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "repressurizer-diary-action-history";
const APP_DATA_KEY = "diary-action-history.json";
const MAX_ENTRIES = 20;

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function readLocal(): DiaryActionHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function isEntry(value: unknown): value is DiaryActionHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<DiaryActionHistoryEntry>;
  if (typeof entry.id !== "string"
    || typeof entry.label !== "string"
    || typeof entry.count !== "number"
    || !Number.isFinite(entry.count)
    || !Number.isFinite(entry.createdAt)) return false;
  if (!entry.snapshot || typeof entry.snapshot !== "object") return false;
  const snapshot = entry.snapshot as Partial<DiaryActionSnapshot>;
  if (!snapshot.diary || typeof snapshot.diary !== "object" || !Array.isArray(snapshot.diary.queue)) return false;
  const diary = snapshot.diary as Partial<DiaryBulkSnapshot>;
  if (!diary.entries || typeof diary.entries !== "object" || !diary.board || typeof diary.board !== "object" || !diary.customAssignments || typeof diary.customAssignments !== "object") return false;
  if (!snapshot.statuses || typeof snapshot.statuses !== "object") return false;
  if (!snapshot.boardPrefs || typeof snapshot.boardPrefs !== "object") return false;
  const boardPrefs = snapshot.boardPrefs as Partial<DiaryBoardPrefs>;
  return Array.isArray(boardPrefs.hiddenColumns)
    && Array.isArray(boardPrefs.customColumns)
    && (boardPrefs.removedAppIds === undefined || Array.isArray(boardPrefs.removedAppIds))
    && !!boardPrefs.columnColors
    && typeof boardPrefs.columnColors === "object"
    && !!boardPrefs.customAssignments
    && typeof boardPrefs.customAssignments === "object";
}

function persist(entries: DiaryActionHistoryEntry[]) {
  const payload = JSON.stringify(entries.slice(0, MAX_ENTRIES));
  try { localStorage.setItem(STORAGE_KEY, payload); } catch {}
  saveAppData(APP_DATA_KEY, payload).catch(() => {});
}

function mergeEntries(local: DiaryActionHistoryEntry[], remote: DiaryActionHistoryEntry[]): DiaryActionHistoryEntry[] {
  const byId = new Map<string, DiaryActionHistoryEntry>();
  for (const entry of [...local, ...remote]) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ENTRIES);
}

const initialEntries = readLocal();

export const useDiaryActionHistoryStore = create<DiaryActionHistoryState>((set, get) => ({
  entries: initialEntries,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    let remote: DiaryActionHistoryEntry[] = [];
    try {
      const raw = await loadAppData(APP_DATA_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) remote = parsed.filter(isEntry);
      }
    } catch {}
    const entries = mergeEntries(get().entries, remote);
    set({ entries, hydrated: true });
    persist(entries);
  },

  push: (entry) => {
    const created: DiaryActionHistoryEntry = {
      ...clone(entry),
      id: makeId(),
      createdAt: Date.now(),
    };
    set((state) => {
      const entries = [created, ...state.entries].slice(0, MAX_ENTRIES);
      persist(entries);
      return { entries };
    });
    return created.id;
  },

  remove: (id) => set((state) => {
    const entries = state.entries.filter((entry) => entry.id !== id);
    if (entries.length !== state.entries.length) persist(entries);
    return { entries };
  }),

  clear: () => set((state) => {
    if (state.entries.length > 0) persist([]);
    return { entries: [] };
  }),
}));
