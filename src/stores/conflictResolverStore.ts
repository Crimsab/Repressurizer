import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import type { CollectionConflictKind, ConflictResolutionChoice } from "../lib/collectionConflictResolver";

const STORAGE_KEY = "conflict-resolver.json";
const SCHEMA_VERSION = 1;

export interface RecentConflictDecision {
  id: string;
  decidedAt: number;
  mergeId: string;
  identity: string;
  kind: CollectionConflictKind;
  choice: ConflictResolutionChoice;
}

interface PersistedConflictResolver {
  version: number;
  defaultPolicy: "ask" | "steam" | "repressurizer";
  kindPolicies: Partial<Record<CollectionConflictKind, "steam" | "repressurizer">>;
  recentDecisions: RecentConflictDecision[];
}

interface ConflictResolverState extends PersistedConflictResolver {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setDefaultPolicy: (policy: PersistedConflictResolver["defaultPolicy"]) => void;
  setKindPolicy: (kind: CollectionConflictKind, policy: "ask" | "steam" | "repressurizer") => void;
  recordDecisions: (mergeId: string, decisions: Array<Omit<RecentConflictDecision, "id" | "decidedAt" | "mergeId">>) => void;
}

function persist(state: Pick<ConflictResolverState, "defaultPolicy" | "kindPolicies" | "recentDecisions">) {
  void saveAppData(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...state })).catch(() => {});
}

function parse(raw: string | null): PersistedConflictResolver | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedConflictResolver>;
    if (value.version !== SCHEMA_VERSION) return null;
    return {
      version: SCHEMA_VERSION,
      defaultPolicy: ["ask", "steam", "repressurizer"].includes(value.defaultPolicy ?? "") ? value.defaultPolicy! : "ask",
      kindPolicies: value.kindPolicies ?? {},
      recentDecisions: Array.isArray(value.recentDecisions) ? value.recentDecisions.slice(0, 200) : [],
    };
  } catch { return null; }
}

export const useConflictResolverStore = create<ConflictResolverState>((set) => ({
  version: SCHEMA_VERSION,
  defaultPolicy: "ask",
  kindPolicies: {},
  recentDecisions: [],
  hydrated: false,
  hydrate: async () => {
    const loaded = parse(await loadAppData(STORAGE_KEY).catch(() => null));
    set(loaded ? { ...loaded, hydrated: true } : { hydrated: true });
  },
  setDefaultPolicy: (defaultPolicy) => set((state) => { const next = { ...state, defaultPolicy }; persist(next); return { defaultPolicy }; }),
  setKindPolicy: (kind, policy) => set((state) => {
    const kindPolicies = { ...state.kindPolicies };
    if (policy === "ask") delete kindPolicies[kind]; else kindPolicies[kind] = policy;
    persist({ ...state, kindPolicies });
    return { kindPolicies };
  }),
  recordDecisions: (mergeId, decisions) => set((state) => {
    const decidedAt = Date.now();
    const entries = decisions.map((decision, index) => ({ ...decision, mergeId, decidedAt, id: `${mergeId}:${index}:${decision.identity}:${decision.kind}` }));
    const recentDecisions = [...entries, ...state.recentDecisions].slice(0, 200);
    persist({ ...state, recentDecisions });
    return { recentDecisions };
  }),
}));
