import { useCategoryStore } from "../stores/categoryStore";
import { useSettingsStore } from "../stores/settingsStore";
import { runtimeGeneration } from "./runtimeGeneration";
import type { SteamCollection } from "./types";

export function captureCollectionOperation() {
  const state = useCategoryStore.getState();
  const settings = useSettingsStore.getState();
  return {
    generation: runtimeGeneration(),
    account: JSON.stringify([settings.steamPath, settings.steamId3, settings.steamId64]),
    collections: state.collections,
    saved: state._saved,
  };
}
export type CollectionOperation = ReturnType<typeof captureCollectionOperation>;
export function isCurrentProfile(operation: CollectionOperation): boolean {
  const settings = useSettingsStore.getState();
  return operation.generation === runtimeGeneration() && operation.account ===
    JSON.stringify([settings.steamPath, settings.steamId3, settings.steamId64]);
}
export function canReplaceCollections(operation: CollectionOperation): boolean {
  const current = useCategoryStore.getState();
  return isCurrentProfile(operation) && !current.dirty &&
    current.collections === operation.collections && current._saved === operation.saved;
}
export function acceptSavedCollections(
  operation: CollectionOperation,
  saved: SteamCollection[],
  origin: "manual" | "sync" = "manual",
): boolean {
  const current = useCategoryStore.getState();
  if (!isCurrentProfile(operation) || current._saved !== operation.saved) return false;
  if (current.collections === operation.collections) {
    current.setCollections(saved, origin);
  } else {
    // The write succeeded, but the user kept editing. Advance only the baseline.
    const baseline = structuredClone(saved);
    useCategoryStore.setState({
      _saved: baseline,
      dirty: JSON.stringify(current.collections) !== JSON.stringify(baseline),
    });
  }
  return true;
}
