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
  importDecisions: (decisions: unknown[]) => number;
}

type ConflictMutation =
  | { kind: "default"; policy: PersistedConflictResolver["defaultPolicy"] }
  | { kind: "policy"; conflictKind: CollectionConflictKind; policy: "ask" | "steam" | "repressurizer" }
  | { kind: "decisions"; entries: RecentConflictDecision[] };

let hydration: Promise<void> | null = null;
const pending: ConflictMutation[] = [];

function persist(state: PersistedConflictResolver) {
  return saveAppData(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION,
    defaultPolicy: state.defaultPolicy, kindPolicies: state.kindPolicies, recentDecisions: state.recentDecisions })).catch(() => {});
}

const conflictKinds: CollectionConflictKind[] = ["name", "color", "deletion", "creation", "membership", "order", "metadata"];
const conflictChoices: ConflictResolutionChoice[] = ["steam", "repressurizer", "merge", "manual"];

export function parseRecentConflictDecision(value: unknown): RecentConflictDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const decision = value as Partial<RecentConflictDecision>;
  const { id, decidedAt, mergeId, identity, kind, choice } = decision;
  if (typeof id !== "string" || !id || id.length > 512 ||
      typeof decidedAt !== "number" || !Number.isFinite(decidedAt) || typeof mergeId !== "string" || !mergeId ||
      typeof identity !== "string" || !identity || !conflictKinds.includes(kind as CollectionConflictKind) ||
      !conflictChoices.includes(choice as ConflictResolutionChoice)) return null;
  return {
    id,
    decidedAt,
    mergeId,
    identity,
    kind: kind as CollectionConflictKind,
    choice: choice as ConflictResolutionChoice,
  };
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
      recentDecisions: Array.isArray(value.recentDecisions)
        ? value.recentDecisions.map(parseRecentConflictDecision).filter((item): item is RecentConflictDecision => Boolean(item)).slice(0, 200)
        : [],
    };
  } catch { return null; }
}

function applyMutations(base: PersistedConflictResolver, operations: ConflictMutation[]): PersistedConflictResolver {
  let defaultPolicy = base.defaultPolicy;
  let kindPolicies = { ...base.kindPolicies };
  const decisions = new Map(base.recentDecisions.map((decision) => [decision.id, decision]));
  for (const operation of operations) {
    if (operation.kind === "default") defaultPolicy = operation.policy;
    else if (operation.kind === "policy") {
      if (operation.policy === "ask") delete kindPolicies[operation.conflictKind];
      else kindPolicies[operation.conflictKind] = operation.policy;
    } else {
      for (const decision of operation.entries) decisions.set(decision.id, decision);
    }
  }
  return {
    version: SCHEMA_VERSION,
    defaultPolicy,
    kindPolicies,
    recentDecisions: [...decisions.values()].sort((left, right) => right.decidedAt - left.decidedAt).slice(0, 200),
  };
}

function commit(operation: ConflictMutation): void {
  const store = useConflictResolverStore.getState();
  const next = applyMutations(store, [operation]);
  if (store.hydrated) void persist(next);
  else pending.push(operation);
  useConflictResolverStore.setState(next);
  if (!store.hydrated) void useConflictResolverStore.getState().hydrate();
}

export const useConflictResolverStore = create<ConflictResolverState>((set, get) => ({
  version: SCHEMA_VERSION, defaultPolicy: "ask", kindPolicies: {}, recentDecisions: [], hydrated: false,
  hydrate: () => {
    if (hydration) return hydration;
    if (get().hydrated) return Promise.resolve();
    hydration = (async () => {
      let raw: string | null;
      try { raw = await loadAppData(STORAGE_KEY); } catch { return; }
      const loaded = parse(raw);
      if (raw !== null && !loaded) return;
      const next = applyMutations(loaded ?? { version: SCHEMA_VERSION, defaultPolicy: "ask", kindPolicies: {}, recentDecisions: [] }, pending);
      const write = pending.length ? persist(next) : Promise.resolve();
      pending.length = 0;
      set({ ...next, hydrated: true });
      await write;
    })().finally(() => { hydration = null; });
    return hydration;
  },
  setDefaultPolicy: (policy) => commit({ kind: "default", policy }),
  setKindPolicy: (kind, policy) => commit({ kind: "policy", conflictKind: kind, policy }),
  recordDecisions: (mergeId, decisions) => {
    const decidedAt = Date.now();
    const entries = decisions.map((decision, index) => ({ ...decision, mergeId, decidedAt, id: `${mergeId}:${index}:${decision.identity}:${decision.kind}` }));
    commit({ kind: "decisions", entries });
  },
  importDecisions: (incoming) => {
    const known = new Set(get().recentDecisions.map((decision) => decision.id));
    const entries: RecentConflictDecision[] = [];
    for (const value of incoming) {
      const entry = parseRecentConflictDecision(value);
      if (!entry || known.has(entry.id)) continue;
      known.add(entry.id);
      entries.push(entry);
    }
    if (entries.length) commit({ kind: "decisions", entries });
    return entries.length;
  },
}));
