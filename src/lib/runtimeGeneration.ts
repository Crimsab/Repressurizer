// A generation change invalidates work started for another account or profile.
let generation = 0;
const listeners = new Set<() => void>();
export const runtimeGeneration = () => generation;
export function invalidateRuntime(): void {
  generation += 1;
  for (const listener of listeners) listener();
}
export function onRuntimeInvalidated(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
