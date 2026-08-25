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

interface PendingSync { merge: ProfileSyncMerge; remoteDevice: string; }
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
  const parsed = await Promise.all(candidates.map(async (entry) => {
    try { return parseProfileSyncEnvelope(JSON.parse(await readTextFile(joinPath(folder, entry.name)))); } catch { return null; }
  }));
  const newest = new Map<string, ProfileSyncEnvelope>();
  for (const envelope of parsed) if (envelope && (!newest.has(envelope.deviceId) || newest.get(envelope.deviceId)!.sequence < envelope.sequence)) newest.set(envelope.deviceId, envelope);
  return [...newest.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

async function atomicWrite(folder: string, envelope: ProfileSyncEnvelope) {
  const filename = syncEnvelopeFilename(envelope.deviceId, envelope.sequence); const finalPath = joinPath(folder, filename); const temporaryPath = `${finalPath}.tmp`;
  const body = JSON.stringify(envelope, null, 2);
  await writeTextFile(temporaryPath, body);
  const verified = parseProfileSyncEnvelope(JSON.parse(await readTextFile(temporaryPath)));
  if (!verified || verified.checksum !== envelope.checksum) throw new Error("Temporary sync file failed verification");
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
    set({ syncing: true, lastError: null });
    try {
      const journal = useEntityJournalStore.getState(); const local = currentProfile(journal.deviceId);
      const allEnvelopes = await readRemoteEnvelopes(state.folder);
      const duplicateIdentity = allEnvelopes.find((item) => item.deviceId === journal.deviceId && item.sequence >= state.nextSequence && item.checksum !== state.lastEnvelopeChecksum);
      if (duplicateIdentity) throw new Error("Another installation is using this device ID. Reset one device identity before syncing.");
      const remoteEnvelopes = allEnvelopes.filter((item) => item.deviceId !== journal.deviceId);
      let aggregate = state.workingCopy ?? local; let source: string | null = null;
      for (const remote of remoteEnvelopes) {
        const remoteMerge = mergeProfileDocuments(state.workingCopy, aggregate, remote.profile);
        if (remoteMerge.conflicts.length) { set({ pending: { merge: mergeProfileDocuments(state.workingCopy, local, remote.profile), remoteDevice: remote.deviceId }, syncing: false, lastSourceDevice: remote.deviceId }); return "conflicts"; }
        aggregate = remoteMerge.merged; source = remote.deviceId;
      }
      const merge = mergeProfileDocuments(state.workingCopy, local, aggregate);
      if (merge.conflicts.length) { set({ pending: { merge, remoteDevice: source ?? "shared-folder" }, syncing: false, lastSourceDevice: source }); return "conflicts"; }
      applyProfileSections(merge.merged, ALL_SYNC_SECTIONS, "sync");
      for (const change of profileEntityChanges(state.workingCopy, local)) journal.append(change);
      const updatedJournal = useEntityJournalStore.getState();
      const envelope = createProfileSyncEnvelope({ deviceId: updatedJournal.deviceId, sequence: state.nextSequence, previousChecksum: state.lastEnvelopeChecksum, profile: merge.merged, journal: updatedJournal.entries });
      await atomicWrite(state.folder, envelope);
      const next = { ...get(), syncing: false, pending: null, nextSequence: state.nextSequence + 1, lastSyncAt: Date.now(), lastSourceDevice: source, lastChangedItems: merge.changedItems, lastError: null, workingCopy: merge.merged, lastEnvelopeChecksum: envelope.checksum };
      set(next); persist(next); return "synced";
    } catch (error) { const message = error instanceof Error ? error.message : String(error); const next = { ...get(), syncing: false, lastError: message }; set(next); persist(next); throw error; }
  },
  resolvePending: async (choices) => {
    const state = get(); if (!state.pending) return;
    const resolved = resolveProfileSyncConflicts(state.pending.merge, choices);
    applyProfileSections(resolved, ALL_SYNC_SECTIONS, "sync");
    const journal = useEntityJournalStore.getState(); for (const change of profileEntityChanges(state.workingCopy, resolved)) journal.append(change);
    const updatedJournal = useEntityJournalStore.getState(); const envelope = createProfileSyncEnvelope({ deviceId: updatedJournal.deviceId, sequence: state.nextSequence, previousChecksum: state.lastEnvelopeChecksum, profile: resolved, journal: updatedJournal.entries });
    await atomicWrite(state.folder, envelope);
    const next = { ...get(), pending: null, nextSequence: state.nextSequence + 1, lastSyncAt: Date.now(), lastSourceDevice: state.pending.remoteDevice, lastChangedItems: state.pending.merge.changedItems, lastError: null, workingCopy: resolved, lastEnvelopeChecksum: envelope.checksum };
    set(next); persist(next);
  },
}));

export type { ProfileSyncConflict };
