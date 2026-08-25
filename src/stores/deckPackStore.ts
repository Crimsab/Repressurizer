import { create } from "zustand";
import { buildDeckPack, type DeckPackCandidate, type DeckPackConfig, type DeckPackResult } from "../lib/deckPack";
import { loadAppData, saveAppData } from "../lib/tauri";
const KEY = "deck-packs.json";
export interface SavedDeckPack { id: string; name: string; config: DeckPackConfig; result: DeckPackResult; savedAt: number; }
const defaults: DeckPackConfig = { availableBytes: 128 * 1_073_741_824, safetyPercent: 15, gameCount: 8, wantedCategories: ["short", "long", "offline"], deckFilter: "playable", requireController: true, noLauncher: false, requireOffline: false, minHours: null, maxHours: null, installation: "any", locked: [], excluded: [], seed: 1 };
interface DeckPackState { config: DeckPackConfig; result: DeckPackResult | null; saved: SavedDeckPack[]; hydrated: boolean; hydrate: () => Promise<void>; setConfig: (patch: Partial<DeckPackConfig>) => void; generate: (candidates: DeckPackCandidate[], reroll?: boolean) => DeckPackResult; toggleLocked: (appId: number) => void; toggleExcluded: (appId: number) => void; saveCurrent: (name: string) => string | null; loadSaved: (id: string) => void; removeSaved: (id: string) => void; }
function persist(state: Pick<DeckPackState, "config" | "saved">) { void saveAppData(KEY, JSON.stringify({ version: 1, ...state })).catch(() => {}); }
export const useDeckPackStore = create<DeckPackState>((set, get) => ({ config: defaults, result: null, saved: [], hydrated: false,
  hydrate: async () => { try { const raw = await loadAppData(KEY); if (raw) { const value = JSON.parse(raw); if (value.version === 1) set({ config: { ...defaults, ...value.config }, saved: Array.isArray(value.saved) ? value.saved.slice(0, 20) : [] }); } } catch {} set({ hydrated: true }); },
  setConfig: (patch) => set((state) => { const config = { ...state.config, ...patch }; persist({ config, saved: state.saved }); return { config }; }),
  generate: (candidates, reroll = false) => { const state = get(); const config = reroll ? { ...state.config, seed: state.config.seed + 1 } : state.config; const result = buildDeckPack(candidates, config); set({ config, result }); persist({ config, saved: state.saved }); return result; },
  toggleLocked: (appId) => { const state = get(); get().setConfig({ locked: state.config.locked.includes(appId) ? state.config.locked.filter((id) => id !== appId) : [...state.config.locked, appId], excluded: state.config.excluded.filter((id) => id !== appId) }); },
  toggleExcluded: (appId) => { const state = get(); get().setConfig({ excluded: state.config.excluded.includes(appId) ? state.config.excluded.filter((id) => id !== appId) : [...state.config.excluded, appId], locked: state.config.locked.filter((id) => id !== appId) }); },
  saveCurrent: (name) => { const state = get(); if (!state.result) return null; const id = `pack-${Date.now().toString(36)}`; const saved = [{ id, name: name.trim().slice(0, 80) || "Steam Deck pack", config: structuredClone(state.config), result: structuredClone(state.result), savedAt: Date.now() }, ...state.saved].slice(0, 20); set({ saved }); persist({ config: state.config, saved }); return id; },
  loadSaved: (id) => { const pack = get().saved.find((item) => item.id === id); if (pack) set({ config: structuredClone(pack.config), result: structuredClone(pack.result) }); },
  removeSaved: (id) => set((state) => { const saved = state.saved.filter((item) => item.id !== id); persist({ config: state.config, saved }); return { saved }; }),
}));
