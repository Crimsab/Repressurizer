import { canonicalJson } from "../lib/entityJournal";
import { runtimeGeneration } from "../lib/runtimeGeneration";
import { prepareProfileApplication } from "../lib/profileApplication";
import { readDir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { create } from "zustand";
import { createProfileSyncEnvelope, mergeProfileDocuments, parseProfileSyncEnvelope, profileEntityChanges, resolveProfileSyncConflicts, syncEnvelopeFilename, type ProfileSyncConflict, type ProfileSyncEnvelope, type ProfileSyncMerge } from "../lib/profileSync";
import { createRepressurizerProfile, parseRepressurizerProfile, type RepressurizerProfileDocument } from "../lib/repressurizerProfile";
import { loadAppData, saveAppData } from "../lib/tauri";
import { useEntityJournalStore } from "./entityJournalStore";
import { captureProfileSections, applyProfileSections } from "./profileRuntime";
import { useSettingsStore } from "./settingsStore";

const STORAGE_KEY = "profile-sync.json";
const FILE_PREFIX = ".repressurizer-sync-";
const ALL_SYNC_SECTIONS = new Set(["diary", "kanban", "autocat", "planner", "preferences", "settings", "collections"] as const);

interface PersistedSync {
  version: 1;
  folder: string;
  automatic: boolean;
  paused: boolean;
  intervalMinutes: number;
  nextSequence: number;
  lastSyncAt: number | null;
  lastSourceDevice: string | null;
  lastChangedItems: number;
  lastError: string | null;
  workingCopy: RepressurizerProfileDocument | null;
  lastEnvelopeChecksum: string | null;
}

interface PendingSync { merge: ProfileSyncMerge; remoteDevice: string; generation: number; localChecksum: string; }
interface ProfileSyncState extends PersistedSync {
  hydrated: boolean;
  syncing: boolean;
  pending: PendingSync | null;
  hydrate: () => Promise<void>;
  configure: (patch: Partial<Pick<PersistedSync, "folder" | "automatic" | "paused" | "intervalMinutes">>) => void;
  syncNow: () => Promise<"synced" | "conflicts" | "skipped">;
  resolvePending: (choices: Record<string, "local" | "remote" | "base">) => Promise<void>;
}

const defaults: PersistedSync = { version: 1, folder: "", automatic: false, paused: false, intervalMinutes: 15, nextSequence: 1, lastSyncAt: null, lastSourceDevice: null, lastChangedItems: 0, lastError: null, workingCopy: null, lastEnvelopeChecksum: null };
const joinPath = (folder: string, name: string) => `${folder.replace(/[\\/]+$/, "")}/${name}`;

function persisted(state: ProfileSyncState): PersistedSync {
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, state[key as keyof PersistedSync]])) as unknown as PersistedSync;
}
function persist(state: ProfileSyncState) { void saveAppData(STORAGE_KEY, JSON.stringify(persisted(state))).catch(() => {}); }
function validPersisted(raw: string | null): PersistedSync | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedSync>;
    const workingCopy = value.workingCopy ? parseRepressurizerProfile(value.workingCopy).document : null;
    if (value.version !== 1 || typeof value.folder !== "string" || typeof value.nextSequence !== "number") return null;
    return { ...defaults, ...value, workingCopy };
  } catch { return null; }
}

function currentProfile(deviceId: string): RepressurizerProfileDocument {
  return createRepressurizerProfile({ profileId: "device-sync", name: "Device sync", deviceId, steamAccountId: useSettingsStore.getState().steamId64 || null, sections: captureProfileSections(false) });
}

async function readRemoteEnvelopes(folder: string): Promise<ProfileSyncEnvelope[]> {
  const entries = await readDir(folder);
  const candidates = entries.filter((entry) => entry.isFile && entry.name.startsWith(FILE_PREFIX) && entry.name.endsWith(".json") && !entry.name.endsWith(".tmp"));
  if (candidates.length > 1024) throw new Error("Too many sync files; archive older device snapshots before syncing.");
  const parsed: Array<ProfileSyncEnvelope | null> = [];
  for (let offset = 0; offset < candidates.length; offset += 4) {
    parsed.push(...await Promise.all(candidates.slice(offset, offset + 4).map(async (entry) => {
      try {
        const raw = await readTextFile(joinPath(folder, entry.name));
        if (raw.length > 32_000_000) return null;
        return parseProfileSyncEnvelope(JSON.parse(raw));
      } catch { return null; }
    })));
  }
  const newest = new Map<string, ProfileSyncEnvelope>();
  for (const envelope of parsed) if (envelope && (!newest.has(envelope.deviceId) || newest.get(envelope.deviceId)!.sequence < envelope.sequence)) newest.set(envelope.deviceId, envelope);
  return [...newest.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

async function atomicWrite(folder: string, envelope: ProfileSyncEnvelope, validate: () => void) {
  const filename = syncEnvelopeFilename(envelope.deviceId, envelope.sequence); const finalPath = joinPath(folder, filename); const temporaryPath = `${finalPath}.tmp`;
  const body = JSON.stringify(envelope, null, 2);
  await writeTextFile(temporaryPath, body);
  const verified = parseProfileSyncEnvelope(JSON.parse(await readTextFile(temporaryPath)));
  if (!verified || verified.checksum !== envelope.checksum) throw new Error("Temporary sync file failed verification");
  try { validate(); } catch (error) { await remove(temporaryPath).catch(() => {}); throw error; }
  await rename(temporaryPath, finalPath);
  const entries = await readDir(folder);
  await Promise.all(entries.filter((entry) => entry.isFile && entry.name.startsWith(`${FILE_PREFIX}${envelope.deviceId}-`) && entry.name.endsWith(".json") && entry.name !== filename).map((entry) => remove(joinPath(folder, entry.name)).catch(() => {})));
}

export const useProfileSyncStore = create<ProfileSyncState>((set, get) => ({
  ...defaults, hydrated: false, syncing: false, pending: null,
  hydrate: async () => { const loaded = validPersisted(await loadAppData(STORAGE_KEY).catch(() => null)); set({ ...(loaded ?? defaults), hydrated: true }); },
  configure: (patch) => set((state) => { const next = { ...state, ...patch, intervalMinutes: Math.max(5, Math.min(1440, Math.trunc(patch.intervalMinutes ?? state.intervalMinutes))) }; persist(next); return next; }),
  syncNow: async () => {
    const state = get(); if (!state.folder.trim() || state.paused || state.syncing) return "skipped";
    const generation = runtimeGeneration();
    const account = useSettingsStore.getState().steamId64;
    const validateContext = () => {
      if (runtimeGeneration() !== generation || get().folder !== state.folder || get().paused ||
          get().nextSequence !== state.nextSequence || useSettingsStore.getState().steamId64 !== account) {
        throw new Error("Sync context changed. Local changes were preserved; run sync again.");
      }
    };
    set({ syncing: true, lastError: null });
    try {
      const journal = useEntityJournalStore.getState();
      const allEnvelopes = await readRemoteEnvelopes(state.folder);
      validateContext();
      // Read the working state after remote I/O, not before it.
      const local = currentProfile(journal.deviceId);
      const localChecksum = canonicalJson(local.sections);
      const validateUnchanged = () => {
        validateContext();
        if (canonicalJson(currentProfile(journal.deviceId).sections) !== localChecksum) {
          throw new Error("Profile changed during sync. Local changes were preserved; run sync again.");
        }
      };
      const duplicateIdentity = allEnvelopes.find((item) => item.deviceId === journal.deviceId && item.sequence >= state.nextSequence && item.checksum !== state.lastEnvelopeChecksum);
      if (duplicateIdentity) throw new Error("Another installation is using this device ID. Reset one device identity before syncing.");
      const remoteEnvelopes = allEnvelopes.filter((item) => item.deviceId !== journal.deviceId);
      if (remoteEnvelopes.some((remote) => remote.profile.manifest.steamAccountId &&
          remote.profile.manifest.steamAccountId !== local.manifest.steamAccountId)) {
        throw new Error("The sync folder contains another Steam account. Use a separate folder for each account.");
      }
      let aggregate = state.workingCopy ?? local; let source: string | null = null;
      for (const remote of remoteEnvelopes) {
        const remoteMerge = mergeProfileDocuments(state.workingCopy, aggregate, remote.profile);
        if (remoteMerge.conflicts.length) { set({ pending: { merge: mergeProfileDocuments(state.workingCopy, local, remote.profile), remoteDevice: remote.deviceId, generation, localChecksum }, syncing: false, lastSourceDevice: remote.deviceId }); return "conflicts"; }
        aggregate = remoteMerge.merged; source = remote.deviceId;
      }
      const merge = mergeProfileDocuments(state.workingCopy, local, aggregate);
      if (merge.conflicts.length) { set({ pending: { merge, remoteDevice: source ?? "shared-folder", generation, localChecksum }, syncing: false, lastSourceDevice: source }); return "conflicts"; }
      prepareProfileApplication(merge.merged, ALL_SYNC_SECTIONS, captureProfileSections(true));
      for (const change of profileEntityChanges(state.workingCopy, local)) journal.append(change);
      const updatedJournal = useEntityJournalStore.getState();
      const envelope = createProfileSyncEnvelope({ deviceId: updatedJournal.deviceId, sequence: state.nextSequence, previousChecksum: state.lastEnvelopeChecksum, profile: merge.merged, journal: updatedJournal.entries });
      await atomicWrite(state.folder, envelope, validateUnchanged);
      validateContext();
      // A change during rename must not be replaced. The committed envelope is
      // still the new baseline; a later sync will merge the preserved draft.
      if (canonicalJson(currentProfile(journal.deviceId).sections) === localChecksum) {
        applyProfileSections(merge.merged, ALL_SYNC_SECTIONS, "sync");
      }
      const next = { ...get(), syncing: false, pending: null, nextSequence: state.nextSequence + 1, lastSyncAt: Date.now(), lastSourceDevice: source, lastChangedItems: merge.changedItems, lastError: null, workingCopy: merge.merged, lastEnvelopeChecksum: envelope.checksum };
      set(next); persist(next); return "synced";
    } catch (error) { const message = error instanceof Error ? error.message : String(error); const next = { ...get(), syncing: false, lastError: message }; set(next); persist(next); throw error; }
  },
  resolvePending: async (choices) => {
    const state = get();
    if (!state.pending || state.syncing) return;
    const pending = state.pending;
    const journal = useEntityJournalStore.getState();
    const validate = () => {
      if (state.folder !== get().folder || get().paused || get().nextSequence !== state.nextSequence ||
          runtimeGeneration() !== pending.generation ||
          canonicalJson(currentProfile(journal.deviceId).sections) !== pending.localChecksum) {
        throw new Error("Profile changed since the conflict was shown. Run sync again before resolving.");
      }
    };
    validate();
    const resolved = resolveProfileSyncConflicts(pending.merge, choices);
    prepareProfileApplication(resolved, ALL_SYNC_SECTIONS, captureProfileSections(true));
    set({ syncing: true, lastError: null });
    try {
      const envelope = createProfileSyncEnvelope({ deviceId: journal.deviceId, sequence: state.nextSequence,
        previousChecksum: state.lastEnvelopeChecksum, profile: resolved, journal: journal.entries });
      await atomicWrite(state.folder, envelope, validate);
      // Never overwrite a change made while the final rename was pending.
      if (runtimeGeneration() !== pending.generation || get().folder !== state.folder) {
        throw new Error("Sync context changed after the file was written; local changes were preserved.");
      }
      if (canonicalJson(currentProfile(journal.deviceId).sections) === pending.localChecksum) {
        applyProfileSections(resolved, ALL_SYNC_SECTIONS, "sync");
      }
      const next = { ...get(), syncing: false, pending: null, nextSequence: state.nextSequence + 1,
        lastSyncAt: Date.now(), lastSourceDevice: pending.remoteDevice, lastChangedItems: pending.merge.changedItems,
        lastError: null, workingCopy: resolved, lastEnvelopeChecksum: envelope.checksum };
      set(next); persist(next);
    } catch (error) {
      set({ syncing: false, lastError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
}));

export type { ProfileSyncConflict };
