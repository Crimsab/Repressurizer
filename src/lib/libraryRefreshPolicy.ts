export interface LibraryResumeRefreshState {
  hiddenAt: number | null;
  lastRequestedAt: number;
}

export const DEFAULT_LIBRARY_RESUME_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export function markLibraryWindowHidden(
  state: LibraryResumeRefreshState,
  now: number,
): LibraryResumeRefreshState {
  return { ...state, hiddenAt: now };
}

export function requestLibraryRefreshOnResume(
  state: LibraryResumeRefreshState,
  now: number,
  cooldownMs = DEFAULT_LIBRARY_RESUME_REFRESH_COOLDOWN_MS,
): LibraryResumeRefreshState | null {
  if (state.hiddenAt == null || now < state.hiddenAt) return null;
  if (
    state.lastRequestedAt > 0 &&
    now - state.lastRequestedAt < Math.max(0, cooldownMs)
  ) {
    return null;
  }
  return { hiddenAt: null, lastRequestedAt: now };
}
