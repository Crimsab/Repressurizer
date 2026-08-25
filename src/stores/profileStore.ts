import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import { createRepressurizerProfile, parseRepressurizerProfile, type RepressurizerProfileDocument } from "../lib/repressurizerProfile";
import { useEntityJournalStore } from "./entityJournalStore";

const STORAGE_KEY = "repressurizer-profiles.json";
const SCHEMA_VERSION = 1;

interface PersistedProfiles { version: number; profiles: RepressurizerProfileDocument[]; backups: RepressurizerProfileDocument[]; }
interface ProfileState extends PersistedProfiles {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  upsert: (profile: RepressurizerProfileDocument) => void;
  rename: (profileId: string, name: string) => void;
  duplicate: (profileId: string) => string | null;
  remove: (profileId: string) => void;
  backup: (profile: RepressurizerProfileDocument) => void;
}

function persist(state: Pick<ProfileState, "profiles" | "backups">) { void saveAppData(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...state })).catch(() => {}); }
function parse(raw: string | null): PersistedProfiles | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedProfiles>;
    if (value.version !== SCHEMA_VERSION) return null;
    const valid = (items: unknown[]) => items.map((item) => parseRepressurizerProfile(item).document).filter((item): item is RepressurizerProfileDocument => Boolean(item));
    return { version: SCHEMA_VERSION, profiles: valid(value.profiles ?? []).slice(0, 50), backups: valid(value.backups ?? []).slice(0, 10) };
  } catch { return null; }
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  version: SCHEMA_VERSION, profiles: [], backups: [], hydrated: false,
  hydrate: async () => { const loaded = parse(await loadAppData(STORAGE_KEY).catch(() => null)); set(loaded ? { ...loaded, hydrated: true } : { hydrated: true }); },
  upsert: (profile) => {
    if (!parseRepressurizerProfile(profile).document) return;
    set((state) => { const profiles = [profile, ...state.profiles.filter((item) => item.manifest.profileId !== profile.manifest.profileId)].slice(0, 50); persist({ profiles, backups: state.backups }); return { profiles }; });
    useEntityJournalStore.getState().append({ entityType: "profile", entityId: profile.manifest.profileId, operation: "update", value: profile });
  },
  rename: (profileId, name) => { const profile = get().profiles.find((item) => item.manifest.profileId === profileId); if (!profile) return; get().upsert(createRepressurizerProfile({ profileId, name, deviceId: profile.manifest.deviceId, steamAccountId: profile.manifest.steamAccountId, sections: profile.sections })); },
  duplicate: (profileId) => { const profile = get().profiles.find((item) => item.manifest.profileId === profileId); if (!profile) return null; const nextId = `${profileId}-copy-${Date.now().toString(36)}`; get().upsert(createRepressurizerProfile({ profileId: nextId, name: `${profile.manifest.name} Copy`, deviceId: profile.manifest.deviceId, steamAccountId: profile.manifest.steamAccountId, sections: profile.sections })); return nextId; },
  remove: (profileId) => set((state) => { const profiles = state.profiles.filter((item) => item.manifest.profileId !== profileId); persist({ profiles, backups: state.backups }); return { profiles }; }),
  backup: (profile) => set((state) => { const backups = [profile, ...state.backups].slice(0, 10); persist({ profiles: state.profiles, backups }); return { backups }; }),
}));
