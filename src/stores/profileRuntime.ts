import type { StoreApi } from "zustand";
import { prepareProfileApplication } from "../lib/profileApplication";
import { withPersistenceTransaction } from "../lib/persistenceQueue";
import { invalidateRuntime } from "../lib/runtimeGeneration";
import { sanitizeProfileSettings, type ProfileSectionKey, type RepressurizerProfileDocument } from "../lib/repressurizerProfile";
import type { AppSettings, SteamCollection } from "../lib/types";
import { useAutoCategorizeStore } from "./autoCategorizeStore";
import { useCategoryStore } from "./categoryStore";
import { useCollectionTimeMachineStore } from "./collectionTimeMachineStore";
import { useConflictResolverStore } from "./conflictResolverStore";
import { useDiaryStore, type DiaryProfileData } from "./diaryStore";
import { useEntityJournalStore } from "./entityJournalStore";
import { useNotesStore } from "./notesStore";
import { useReviewStore, type GameReview } from "./reviewStore";
import { useSessionPlannerStore } from "./sessionPlannerStore";
import { useSettingsStore } from "./settingsStore";
import { useStatusStore, type GameStatus } from "./statusStore";
import { useTagsStore } from "./tagsStore";

export function captureProfileSections(includeHistory: boolean): RepressurizerProfileDocument["sections"] {
  const diary = useDiaryStore.getState(); const auto = useAutoCategorizeStore.getState(); const planner = useSessionPlannerStore.getState();
  const { set: _setAuto, lastResult: _lastResult, ...autoData } = auto;
  return {
    diary: { entries: diary.entries, queue: diary.queue, finishPrompts: diary.finishPrompts, journal: diary.journal, pages: diary.pages, revisions: includeHistory ? diary.revisions : [], templates: diary.templates },
    kanban: { board: diary.board, boardPrefs: diary.boardPrefs }, autocat: autoData,
    planner: { config: planner.config, presets: planner.presets, hiddenUntil: planner.hiddenUntil, permanentlySuppressed: planner.permanentlySuppressed, frequency: planner.frequency, pinnedAppId: planner.pinnedAppId, queue: planner.queue, recentQueues: planner.recentQueues, history: includeHistory ? planner.history : [] },
    preferences: { statuses: useStatusStore.getState().statuses, notes: useNotesStore.getState().notes, tags: useTagsStore.getState().tags, reviews: useReviewStore.getState().reviews },
    settings: sanitizeProfileSettings(useSettingsStore.getState() as unknown as Record<string, unknown>), collections: useCategoryStore.getState().collections.filter((collection) => !collection.is_dynamic),
    ...(includeHistory ? { history: { collectionSnapshots: useCollectionTimeMachineStore.getState().snapshots, collectionEvents: useCollectionTimeMachineStore.getState().events, recentConflictDecisions: useConflictResolverStore.getState().recentDecisions, entityJournal: useEntityJournalStore.getState().entries } } : {}),
  };
}

export function applyProfileSections(document: RepressurizerProfileDocument, selected: ReadonlySet<ProfileSectionKey>, origin: "import" | "sync" = "import") {
  const sections = prepareProfileApplication(document, selected, captureProfileSections(true));
  if (Object.keys(sections).length === 0) return;
  const undo = [captureStore(useDiaryStore), captureStore(useAutoCategorizeStore), captureStore(useCategoryStore),
    captureStore(useCollectionTimeMachineStore), captureStore(useConflictResolverStore), captureStore(useEntityJournalStore),
    captureStore(useNotesStore), captureStore(useReviewStore), captureStore(useSessionPlannerStore),
    captureStore(useSettingsStore), captureStore(useStatusStore), captureStore(useTagsStore)];
  const storage = captureLocalStorage();
  withPersistenceTransaction(() => {
    try {
      applyPreparedSections(sections, selected, origin);
    } catch (error) {
      for (const restore of undo) { try { restore(); } catch { /* Preserve the original application error. */ } }
      restoreLocalStorage(storage);
      throw error;
    }
  });
  invalidateRuntime();
}

function captureStore<T>(store: Pick<StoreApi<T>, "getState" | "setState">): () => void {
  const original = store.getState();
  return () => store.setState(original, true);
}
function captureLocalStorage(): Map<string, string> {
  const snapshot = new Map<string, string>();
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("repressurizer-")) snapshot.set(key, localStorage.getItem(key) ?? "");
    }
  } catch { /* Native persistence still provides the durable copy. */ }
  return snapshot;
}
function restoreLocalStorage(snapshot: Map<string, string>) {
  try {
    for (const key of captureLocalStorage().keys()) if (!snapshot.has(key)) localStorage.removeItem(key);
    for (const [key, value] of snapshot) localStorage.setItem(key, value);
  } catch { /* The original application error remains the primary failure. */ }
}
function applyPreparedSections(sections: RepressurizerProfileDocument["sections"], selected: ReadonlySet<ProfileSectionKey>, origin: "import" | "sync") {
  if (selected.has("diary") && sections.diary) useDiaryStore.getState().restoreProfile(sections.diary as Partial<DiaryProfileData>);
  if (selected.has("kanban") && sections.kanban) useDiaryStore.getState().restoreProfile(sections.kanban as Partial<DiaryProfileData>);
  if (selected.has("autocat") && sections.autocat) useAutoCategorizeStore.getState().set(sections.autocat as Parameters<ReturnType<typeof useAutoCategorizeStore.getState>["set"]>[0]);
  if (selected.has("planner") && sections.planner) useSessionPlannerStore.getState().restoreProfile(sections.planner as Parameters<ReturnType<typeof useSessionPlannerStore.getState>["restoreProfile"]>[0]);
  if (selected.has("preferences") && sections.preferences) {
    const value = sections.preferences as { statuses?: Record<number, GameStatus>; notes?: Record<number, string>; tags?: Record<number, string[]>; reviews?: Record<number, GameReview> };
    if (value.statuses) useStatusStore.getState().restoreAll(value.statuses); if (value.notes) useNotesStore.getState().restoreAll(value.notes); if (value.tags) useTagsStore.getState().restoreAll(value.tags); if (value.reviews) useReviewStore.getState().restoreAll(value.reviews);
  }
  if (selected.has("settings") && sections.settings) useSettingsStore.getState().setSettings(sanitizeProfileSettings(sections.settings as Record<string, unknown>) as Partial<AppSettings>);
  if (selected.has("collections") && sections.collections) useCategoryStore.getState().applyImportedCollections([
    ...useCategoryStore.getState().collections.filter((collection) => collection.is_dynamic),
    ...(sections.collections as SteamCollection[]).filter((collection) => !collection.is_dynamic),
  ], origin);
  if (selected.has("history") && sections.history) { const history = sections.history as { collectionSnapshots?: unknown[] }; for (const snapshot of history.collectionSnapshots ?? []) useCollectionTimeMachineStore.getState().addImportedSnapshot(snapshot as Parameters<ReturnType<typeof useCollectionTimeMachineStore.getState>["addImportedSnapshot"]>[0]); }
}
