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

type ProfileMutation =
  | { kind: "upsert"; profile: RepressurizerProfileDocument }
  | { kind: "remove"; profileId: string }
  | { kind: "backup"; profile: RepressurizerProfileDocument };

function persist(state: Pick<ProfileState, "profiles" | "backups">) {
  return saveAppData(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, profiles: state.profiles, backups: state.backups })).catch(() => {});
}

function parse(raw: string | null): PersistedProfiles | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedProfiles>;
    if (value.version !== SCHEMA_VERSION) return null;
    const valid = (items: unknown[]) => items.map((item) => parseRepressurizerProfile(item).document).filter((item): item is RepressurizerProfileDocument => Boolean(item));
    return { version: SCHEMA_VERSION, profiles: valid(Array.isArray(value.profiles) ? value.profiles : []).slice(0, 50), backups: valid(Array.isArray(value.backups) ? value.backups : []).slice(0, 10) };
  } catch { return null; }
}

function applyMutations(base: PersistedProfiles, operations: ProfileMutation[]): PersistedProfiles {
  let profiles = [...base.profiles];
  let backups = [...base.backups];
  for (const operation of operations) {
    if (operation.kind === "upsert") {
      profiles = [operation.profile, ...profiles.filter((item) => item.manifest.profileId !== operation.profile.manifest.profileId)].slice(0, 50);
    } else if (operation.kind === "remove") {
      profiles = profiles.filter((item) => item.manifest.profileId !== operation.profileId);
    } else if (!backups.some((item) => item.manifest.checksum === operation.profile.manifest.checksum)) {
      backups = [operation.profile, ...backups].slice(0, 10);
    }
  }
  return { version: SCHEMA_VERSION, profiles, backups };
}

export const useProfileStore = create<ProfileState>((set, get) => {
  let hydration: Promise<void> | null = null;
  const pending: ProfileMutation[] = [];
  const mutate = (operation: ProfileMutation) => {
    const state = get();
    const next = applyMutations(state, [operation]);
    if (!state.hydrated) pending.push(operation);
    if (state.hydrated) void persist(next);
    set(next);
    if (!state.hydrated) void get().hydrate();
  };
  return {
    version: SCHEMA_VERSION, profiles: [], backups: [], hydrated: false,
    hydrate: () => {
      if (hydration) return hydration;
      if (get().hydrated) return Promise.resolve();
      hydration = Promise.resolve().then(async () => {
        // A rejected read is not an empty file: keep pending edits for retry.
        let raw: string | null;
        try { raw = await loadAppData(STORAGE_KEY); } catch { return; }
        const parsed = parse(raw);
        if (raw !== null && !parsed) return;
        const loaded = parsed ?? { version: SCHEMA_VERSION, profiles: [], backups: [] };
        const changed = pending.length > 0;
        const merged = applyMutations(loaded, pending);
        pending.length = 0;
        // Queue the initial snapshot before notifying subscribers, which may edit.
        const saved = changed ? persist(merged) : Promise.resolve();
        set({ ...merged, hydrated: true });
        await saved;
      }).finally(() => { hydration = null; });
      return hydration;
    },
    upsert: (profile) => {
      if (!parseRepressurizerProfile(profile).document) return;
      mutate({ kind: "upsert", profile });
      useEntityJournalStore.getState().append({ entityType: "profile", entityId: profile.manifest.profileId, operation: "update", value: profile });
    },
    rename: (profileId, name) => { const profile = get().profiles.find((item) => item.manifest.profileId === profileId); if (!profile) return; get().upsert(createRepressurizerProfile({ profileId, name, deviceId: profile.manifest.deviceId, steamAccountId: profile.manifest.steamAccountId, sections: profile.sections })); },
    duplicate: (profileId) => { const profile = get().profiles.find((item) => item.manifest.profileId === profileId); if (!profile) return null; const nextId = `${profileId}-copy-${Date.now().toString(36)}`; get().upsert(createRepressurizerProfile({ profileId: nextId, name: `${profile.manifest.name} Copy`, deviceId: profile.manifest.deviceId, steamAccountId: profile.manifest.steamAccountId, sections: profile.sections })); return nextId; },
    remove: (profileId) => mutate({ kind: "remove", profileId }),
    backup: (profile) => {
      if (!parseRepressurizerProfile(profile).document) return;
      mutate({ kind: "backup", profile });
    },
  };
});
