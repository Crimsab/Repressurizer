import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import {
  classifyProviderError,
  recordProviderObservation,
  type MetadataProvider,
  type ProviderHealthRecord,
  type ProviderOutcome,
} from "../lib/providerHealth";

const STORAGE_KEY = "provider-health.json";
const SCHEMA_VERSION = 1;

interface PersistedProviderHealth {
  version: number;
  providers: Partial<Record<MetadataProvider, ProviderHealthRecord>>;
  games: Partial<Record<MetadataProvider, Record<number, ProviderHealthRecord>>>;
}

interface ProviderHealthState extends PersistedProviderHealth {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  record: (
    provider: MetadataProvider,
    outcome: ProviderOutcome,
    appId?: number,
    observedAt?: number,
  ) => void;
  recordBatch: (
    provider: MetadataProvider,
    observations: ReadonlyArray<{ outcome: ProviderOutcome; appId?: number; observedAt?: number }>,
  ) => void;
  recordError: (provider: MetadataProvider, error: unknown, appId?: number) => void;
  clearProvider: (provider: MetadataProvider) => void;
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

function queuePersist(state: Pick<ProviderHealthState, "providers" | "games">) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const payload: PersistedProviderHealth = {
      version: SCHEMA_VERSION,
      providers: state.providers,
      games: state.games,
    };
    void saveAppData(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
  }, 250);
}

function parsePersisted(raw: string | null): PersistedProviderHealth | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedProviderHealth>;
    if (value.version !== SCHEMA_VERSION || !value.providers || !value.games) return null;
    return value as PersistedProviderHealth;
  } catch {
    return null;
  }
}

export const useProviderHealthStore = create<ProviderHealthState>((set) => ({
  version: SCHEMA_VERSION,
  providers: {},
  games: {},
  hydrated: false,

  hydrate: async () => {
    const persisted = parsePersisted(await loadAppData(STORAGE_KEY).catch(() => null));
    set({
      providers: persisted?.providers ?? {},
      games: persisted?.games ?? {},
      hydrated: true,
    });
  },

  record: (provider, outcome, appId, observedAt) =>
    set((state) => {
      const providers = {
        ...state.providers,
        [provider]: recordProviderObservation(
          state.providers[provider],
          provider,
          outcome,
          observedAt,
        ),
      };
      let games = state.games;
      if (appId !== undefined) {
        const providerGames = state.games[provider] ?? {};
        games = {
          ...state.games,
          [provider]: {
            ...providerGames,
            [appId]: recordProviderObservation(
              providerGames[appId],
              provider,
              outcome,
              observedAt,
            ),
          },
        };
      }
      queuePersist({ providers, games });
      return { providers, games };
    }),

  recordBatch: (provider, observations) => {
    if (!observations.length) return;
    set((state) => {
      let providerRecord = state.providers[provider];
      const providerGames = { ...(state.games[provider] ?? {}) };
      for (const observation of observations) {
        providerRecord = recordProviderObservation(
          providerRecord,
          provider,
          observation.outcome,
          observation.observedAt,
        );
        if (observation.appId !== undefined) {
          providerGames[observation.appId] = recordProviderObservation(
            providerGames[observation.appId],
            provider,
            observation.outcome,
            observation.observedAt,
          );
        }
      }
      const providers = { ...state.providers, [provider]: providerRecord };
      const games = { ...state.games, [provider]: providerGames };
      queuePersist({ providers, games });
      return { providers, games };
    });
  },

  recordError: (provider, error, appId) => {
    useProviderHealthStore.getState().record(provider, classifyProviderError(error), appId);
  },

  clearProvider: (provider) =>
    set((state) => {
      const providers = { ...state.providers };
      const games = { ...state.games };
      delete providers[provider];
      delete games[provider];
      queuePersist({ providers, games });
      return { providers, games };
    }),
}));
