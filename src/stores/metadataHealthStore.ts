import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
const KEY = "metadata-health-settings.json";
interface MetadataHealthState { freshnessDays: number; hydrated: boolean; hydrate: () => Promise<void>; setFreshnessDays: (days: number) => void; }
export const useMetadataHealthStore = create<MetadataHealthState>((set) => ({ freshnessDays: 14, hydrated: false,
  hydrate: async () => { try { const raw = await loadAppData(KEY); if (raw) { const value = JSON.parse(raw); if (value.version === 1) set({ freshnessDays: Math.max(1, Math.min(365, Number(value.freshnessDays) || 14)) }); } } catch {} set({ hydrated: true }); },
  setFreshnessDays: (days) => { const freshnessDays = Math.max(1, Math.min(365, Math.trunc(days) || 14)); set({ freshnessDays }); void saveAppData(KEY, JSON.stringify({ version: 1, freshnessDays })).catch(() => {}); },
}));
