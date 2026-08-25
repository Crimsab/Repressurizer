import { entityChecksum } from "./entityJournal";
import { getHltbHours } from "./hltb";
import { stableEventId, type MetadataProvider, type ProviderHealthRecord } from "./providerHealth";
import type { HltbData } from "./tauri";
import type { GameDetails, HltbTimeMode, OwnedGame, SteamCollection } from "./types";

export type InboxCategory =
  | "library"
  | "installation"
  | "family"
  | "metadata"
  | "provider"
  | "autocat"
  | "diary"
  | "collections"
  | "hltb";

export type InboxImportance = "info" | "important" | "error";
export type InboxConfidence = "high" | "medium" | "low";
export type InboxEventStatus = "unread" | "reviewed" | "ignored" | "accepted" | "snoozed";
export type InboxRecommendedAction =
  | "review"
  | "open-game"
  | "open-collection"
  | "refresh-provider"
  | "run-autocat"
  | "fix-diary";

export type InboxEventKind =
  | "games-added"
  | "games-removed"
  | "games-installed"
  | "games-uninstalled"
  | "family-added"
  | "family-removed"
  | "uncategorized"
  | "metadata-missing"
  | "metadata-stale"
  | "provider-error"
  | "autocat-proposal"
  | "diary-finished-playing"
  | "diary-started-not-started"
  | "collections-external"
  | "hltb-overrun";

export interface LibraryInboxEvent {
  id: string;
  kind: InboxEventKind;
  category: InboxCategory;
  importance: InboxImportance;
  occurredAt: number;
  lastObservedAt: number;
  source: string;
  confidence: InboxConfidence;
  recommendedAction: InboxRecommendedAction;
  status: InboxEventStatus;
  snoozedUntil: number | null;
  appIds: number[];
  count: number;
  provider?: MetadataProvider;
  context?: string;
}

export interface LibraryInboxSnapshot {
  version: 1;
  observedAt: number;
  libraryAppIds: number[];
  installedAppIds: number[] | null;
  familyAppIds: number[];
  familyObservedAt: number | null;
  collectionsChecksum: string;
}

export interface LibraryInboxObservation {
  observedAt?: number;
  games: Record<number, OwnedGame>;
  steamLibraryAppIds: number[];
  installedAppIds: number[] | null;
  familyAppIds: number[];
  familyObservedAt: number | null;
  collections: SteamCollection[];
  details: Record<number, GameDetails>;
  detailsMaxAgeDays: number;
  hltbData: Record<number, HltbData>;
  hltbTimeMode: HltbTimeMode;
  statuses: Record<number, string>;
  diaryEntries: Record<number, { decision?: string; markedBacklog?: boolean }>;
}

function sortedUnique(ids: number[]): number[] {
  return [...new Set(ids.filter(Number.isFinite).map(Math.trunc))].sort((left, right) => left - right);
}

export function libraryCollectionsChecksum(collections: SteamCollection[]): string {
  return entityChecksum(collections
    .filter((collection) => !collection.is_dynamic)
    .map((collection) => ({
      key: collection.key,
      name: collection.name,
      added: sortedUnique(collection.added),
      removed: sortedUnique(collection.removed),
      deleted: collection.is_deleted,
    }))
    .sort((left, right) => left.key.localeCompare(right.key)));
}

export function createLibraryInboxSnapshot(input: LibraryInboxObservation): LibraryInboxSnapshot {
  return {
    version: 1,
    observedAt: input.observedAt ?? Date.now(),
    libraryAppIds: sortedUnique(input.steamLibraryAppIds),
    installedAppIds: input.installedAppIds == null ? null : sortedUnique(input.installedAppIds),
    familyAppIds: sortedUnique(input.familyAppIds),
    familyObservedAt: input.familyObservedAt,
    collectionsChecksum: libraryCollectionsChecksum(input.collections),
  };
}

function difference(current: number[], previous: number[]): number[] {
  const previousSet = new Set(previous);
  return current.filter((id) => !previousSet.has(id));
}

function makeEvent(
  kind: InboxEventKind,
  category: InboxCategory,
  observedAt: number,
  input: {
    appIds?: number[];
    count?: number;
    importance: InboxImportance;
    source: string;
    confidence: InboxConfidence;
    recommendedAction: InboxRecommendedAction;
    provider?: MetadataProvider;
    context?: string;
  },
): LibraryInboxEvent {
  const appIds = sortedUnique(input.appIds ?? []);
  return {
    id: stableEventId(["library-inbox", kind, input.provider ?? "", input.context ?? ""]),
    kind,
    category,
    importance: input.importance,
    occurredAt: observedAt,
    lastObservedAt: observedAt,
    source: input.source,
    confidence: input.confidence,
    recommendedAction: input.recommendedAction,
    status: "unread",
    snoozedUntil: null,
    appIds,
    count: input.count ?? appIds.length,
    provider: input.provider,
    context: input.context,
  };
}

export function detectLibraryInboxEvents(
  previous: LibraryInboxSnapshot | null,
  input: LibraryInboxObservation,
): { snapshot: LibraryInboxSnapshot; events: LibraryInboxEvent[] } {
  const snapshot = createLibraryInboxSnapshot(input);
  const observedAt = snapshot.observedAt;
  const events: LibraryInboxEvent[] = [];

  if (previous) {
    const added = difference(snapshot.libraryAppIds, previous.libraryAppIds);
    const removed = difference(previous.libraryAppIds, snapshot.libraryAppIds);
    if (added.length) events.push(makeEvent("games-added", "library", observedAt, { appIds: added, importance: "important", source: "Steam Web API", confidence: "high", recommendedAction: "review" }));
    if (removed.length) events.push(makeEvent("games-removed", "library", observedAt, { appIds: removed, importance: "important", source: "Steam Web API", confidence: "high", recommendedAction: "review" }));

    if (snapshot.installedAppIds && previous.installedAppIds) {
      const installed = difference(snapshot.installedAppIds, previous.installedAppIds);
      const uninstalled = difference(previous.installedAppIds, snapshot.installedAppIds);
      if (installed.length) events.push(makeEvent("games-installed", "installation", observedAt, { appIds: installed, importance: "info", source: "Local Steam libraries", confidence: "high", recommendedAction: "review" }));
      if (uninstalled.length) events.push(makeEvent("games-uninstalled", "installation", observedAt, { appIds: uninstalled, importance: "info", source: "Local Steam libraries", confidence: "high", recommendedAction: "review" }));
    }

    // Family cache is only comparable when a genuinely newer observation exists.
    // Re-reading an old cache must never turn a temporary API failure into removals.
    if (snapshot.familyObservedAt && snapshot.familyObservedAt !== previous.familyObservedAt) {
      events.push(...detectFamilyInboxEvents(previous.familyAppIds, snapshot.familyAppIds, observedAt));
    }

    if (snapshot.collectionsChecksum !== previous.collectionsChecksum) {
      events.push(makeEvent("collections-external", "collections", observedAt, { importance: "important", source: "Steam local config", confidence: "high", recommendedAction: "open-collection" }));
    }
  }

  const libraryIds = Object.keys(input.games).map(Number);
  const categorized = new Set(input.collections.filter((collection) => !collection.is_dynamic && !collection.is_deleted).flatMap((collection) => collection.added));
  const uncategorized = libraryIds.filter((appId) => !categorized.has(appId));
  if (uncategorized.length) events.push(makeEvent("uncategorized", "collections", observedAt, { appIds: uncategorized, importance: "info", source: "Steam collections", confidence: "high", recommendedAction: "run-autocat" }));

  const missingDetails = libraryIds.filter((appId) => !input.details[appId]);
  if (missingDetails.length) events.push(makeEvent("metadata-missing", "metadata", observedAt, { appIds: missingDetails, importance: "info", source: "Steam Store metadata", confidence: "high", recommendedAction: "refresh-provider" }));
  const staleBefore = observedAt - Math.max(0, input.detailsMaxAgeDays) * 86_400_000;
  const staleDetails = libraryIds.filter((appId) => {
    const fetchedAt = input.details[appId]?.fetched_at;
    return fetchedAt != null && fetchedAt < staleBefore;
  });
  if (staleDetails.length) events.push(makeEvent("metadata-stale", "metadata", observedAt, { appIds: staleDetails, importance: "info", source: "Steam Store metadata", confidence: "high", recommendedAction: "refresh-provider" }));

  const finishedPlaying: number[] = [];
  const startedNotStarted: number[] = [];
  const hltbOverrun: number[] = [];
  for (const appId of libraryIds) {
    const game = input.games[appId];
    const status = input.statuses[appId] ?? "none";
    const diaryDecision = input.diaryEntries[appId]?.decision;
    if ((status === "completed" || status === "beaten") && diaryDecision === "next") {
      finishedPlaying.push(appId);
    }
    if (game.playtime_forever > 0 && status === "none" && (diaryDecision === "backlog" || input.diaryEntries[appId]?.markedBacklog)) {
      startedNotStarted.push(appId);
    }
    const hltb = getHltbHours(input.hltbData[appId], input.hltbTimeMode);
    if (hltb != null && hltb > 0 && game.playtime_forever / 60 > hltb) {
      hltbOverrun.push(appId);
    }
  }
  if (finishedPlaying.length) events.push(makeEvent("diary-finished-playing", "diary", observedAt, { appIds: finishedPlaying, importance: "important", source: "Diary + game status", confidence: "high", recommendedAction: "fix-diary" }));
  if (startedNotStarted.length) events.push(makeEvent("diary-started-not-started", "diary", observedAt, { appIds: startedNotStarted, importance: "important", source: "Steam playtime + Diary", confidence: "high", recommendedAction: "fix-diary" }));
  if (hltbOverrun.length) events.push(makeEvent("hltb-overrun", "hltb", observedAt, { appIds: hltbOverrun, importance: "info", source: "Steam playtime + HLTB", confidence: "medium", recommendedAction: "open-game" }));

  return { snapshot, events };
}

export function detectFamilyInboxEvents(previousIds: number[], currentIds: number[], observedAt = Date.now()): LibraryInboxEvent[] {
  const familyAdded = difference(sortedUnique(currentIds), sortedUnique(previousIds));
  const familyRemoved = difference(sortedUnique(previousIds), sortedUnique(currentIds));
  const events: LibraryInboxEvent[] = [];
  if (familyAdded.length) events.push(makeEvent("family-added", "family", observedAt, { appIds: familyAdded, importance: "info", source: "Steam Family", confidence: "high", recommendedAction: "review" }));
  if (familyRemoved.length) events.push(makeEvent("family-removed", "family", observedAt, { appIds: familyRemoved, importance: "important", source: "Steam Family", confidence: "high", recommendedAction: "review" }));
  return events;
}

export function providerHealthInboxEvents(
  providers: Partial<Record<MetadataProvider, ProviderHealthRecord>>,
  observedAt = Date.now(),
): LibraryInboxEvent[] {
  return Object.values(providers).flatMap((record) => {
    if (!record || record.lastOutcome === "success" || record.lastOutcome === "missing") return [];
    return [makeEvent("provider-error", "provider", observedAt, {
      importance: "error",
      source: record.provider,
      confidence: "high",
      recommendedAction: "refresh-provider",
      provider: record.provider,
      context: record.lastOutcome,
    })];
  });
}

export function autoCatProposalInboxEvent(name: string, matchCount: number, observedAt = Date.now()): LibraryInboxEvent {
  return makeEvent("autocat-proposal", "autocat", observedAt, {
    count: Math.max(0, Math.trunc(matchCount)),
    importance: "info",
    source: "Auto-Categorizer",
    confidence: "high",
    recommendedAction: "run-autocat",
    context: name.trim().slice(0, 120),
  });
}

const AGGREGATED_KINDS = new Set<InboxEventKind>([
  "diary-finished-playing",
  "diary-started-not-started",
  "hltb-overrun",
]);

/** Collapse legacy per-game rows into one actionable row per condition. */
export function compactLibraryInboxEvents(events: readonly LibraryInboxEvent[]): LibraryInboxEvent[] {
  const passthrough: LibraryInboxEvent[] = [];
  const grouped = new Map<InboxEventKind, LibraryInboxEvent[]>();
  for (const event of events) {
    if (!AGGREGATED_KINDS.has(event.kind)) {
      passthrough.push(event);
      continue;
    }
    grouped.set(event.kind, [...(grouped.get(event.kind) ?? []), event]);
  }
  for (const [kind, rows] of grouped) {
    const latest = [...rows].sort((left, right) => right.lastObservedAt - left.lastObservedAt)[0];
    const appIds = sortedUnique(rows.flatMap((row) => row.appIds));
    const status: InboxEventStatus = rows.some((row) => row.status === "unread") ? "unread"
      : rows.some((row) => row.status === "snoozed") ? "snoozed"
        : rows.some((row) => row.status === "reviewed") ? "reviewed"
          : rows.some((row) => row.status === "accepted") ? "accepted" : "ignored";
    passthrough.push({
      ...latest,
      id: stableEventId(["library-inbox", kind, latest.provider ?? "", ""]),
      appIds,
      count: appIds.length,
      context: undefined,
      occurredAt: Math.min(...rows.map((row) => row.occurredAt)),
      lastObservedAt: Math.max(...rows.map((row) => row.lastObservedAt)),
      status,
      snoozedUntil: status === "snoozed" ? Math.max(...rows.map((row) => row.snoozedUntil ?? 0)) : null,
    });
  }
  return passthrough.sort((left, right) => right.lastObservedAt - left.lastObservedAt);
}
