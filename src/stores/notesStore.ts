import { create } from "zustand";
import { saveAppData, loadAppData } from "../lib/tauri";
import { runtimeGeneration } from "../lib/runtimeGeneration";

const STORAGE_KEY = "repressurizer-game-notes";

function loadNotes(): Record<number, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotes(notes: Record<number, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {}
  saveAppData("notes.json", JSON.stringify(notes)).catch(() => {});
}

interface NotesState {
  notes: Record<number, string>;
  setNote: (appId: number, text: string) => void;
  getNote: (appId: number) => string;
  restoreAll: (notes: Record<number, string>) => void;
  hydrate: () => Promise<void>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: loadNotes(),

  setNote: (appId, text) =>
    set((state) => {
      const next = { ...state.notes };
      if (text.trim() === "") {
        delete next[appId];
      } else {
        next[appId] = text;
      }
      saveNotes(next);
      return { notes: next };
    }),

  getNote: (appId) => get().notes[appId] ?? "",
  restoreAll: (notes) => { const next = structuredClone(notes); saveNotes(next); set({ notes: next }); },

  hydrate: async () => {
    const generation = runtimeGeneration();
    const before = get().notes;
    try {
      const raw = await loadAppData("notes.json");
      if (generation !== runtimeGeneration() || get().notes !== before) return;
      if (raw) {
        const parsed: Record<number, string> = JSON.parse(raw);
        const local = get().notes;
        const merged = { ...local, ...parsed };
        set({ notes: merged });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    } catch {}
  },
}));
