import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

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
  invoke("save_app_data", { key: "notes.json", data: JSON.stringify(notes) }).catch(() => {});
}

interface NotesState {
  notes: Record<number, string>;
  setNote: (appId: number, text: string) => void;
  getNote: (appId: number) => string;
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

  hydrate: async () => {
    try {
      const raw = await invoke<string | null>("load_app_data", { key: "notes.json" });
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
