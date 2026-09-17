import { afterEach, describe, it, vi } from "vitest";
import { strict as assert } from "node:assert";
import { createStore } from "zustand/vanilla";
import type { TravelMetadataRecord } from "../lib/travelMetadata";

const key = "travel_metadata.json";
const mirrorKey = "repressurizer-travel-metadata";
const note = (offline: boolean | null = null): TravelMetadataRecord => ({ offline, firstLaunchOnline: null, externalLauncher: null, sizeBytes: null });
const prefs = new Set(["preferences"] as const);
const persisted = (records: Record<number, TravelMetadataRecord>) => JSON.stringify({ version: 1, records });

async function fixture(read?: () => Promise<string | null>) {
  vi.resetModules();
  const queue = await import("../lib/persistenceQueue");
  const disk = new Map<string, string>(); const writes: string[] = [];
  let readFile = read ?? (async () => disk.get(key) ?? null);
  let writeFile = async (name: string, data: string) => { disk.set(name, data); writes.push(data); };
  const mirror = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() { return mirror.size; }, key: (index: number) => [...mirror.keys()][index] ?? null,
    getItem: (name: string) => mirror.get(name) ?? null,
    setItem: (name: string, value: string) => { mirror.set(name, value); },
    removeItem: (name: string) => { mirror.delete(name); },
  });
  vi.doMock("../lib/tauri", () => ({
    loadAppData: async (name: string) => { await queue.flushPersistence(name); return readFile(); },
    saveAppData: (name: string, data: string) => queue.enqueuePersistence(name, () => data, (latest) => writeFile(name, latest)),
  }));
  vi.doMock("../lib/collectionTimeMachine", () => ({ parseCollectionSnapshot: () => null, parseCollectionTimelineEvent: () => null }));
  let generation = 0;
  vi.doMock("../lib/runtimeGeneration", () => ({ invalidateRuntime: () => { generation++; } }));
  const ready = { hydrated: true, hydrate: async () => {} };
  const diary = createStore(() => ({ entries: {}, queue: [], finishPrompts: {}, journal: {}, pages: [], revisions: [], templates: [], board: {}, boardPrefs: {}, restoreProfile: () => {} }));
  const planner = createStore(() => ({ config: {}, presets: [], hiddenUntil: {}, permanentlySuppressed: [], frequency: {}, pinnedAppId: null, queue: [], recentQueues: [], history: [], restoreProfile: () => {} }));
  const settings = createStore(() => ({ theme: "light", setSettings: (_value: unknown) => {} }));
  const notes = createStore(() => ({ notes: {} as Record<number, string>, restoreAll: (value: Record<number, string>) => notes.setState({ notes: value }) }));
  const modules: Record<string, Record<string, unknown>> = {
    "./diaryStore": { useDiaryStore: diary },
    "./sessionPlannerStore": { useSessionPlannerStore: planner },
    "./settingsStore": { useSettingsStore: settings },
    "./notesStore": { useNotesStore: notes },
    "./autoCategorizeStore": { useAutoCategorizeStore: createStore(() => ({ set: () => {}, lastResult: null })) },
    "./categoryStore": { useCategoryStore: createStore(() => ({ collections: [], applyImportedCollections: () => {} })) },
    "./collectionTimeMachineStore": { useCollectionTimeMachineStore: createStore(() => ({ ...ready, snapshots: [], events: [], importHistory: () => {} })) },
    "./conflictResolverStore": { useConflictResolverStore: createStore(() => ({ ...ready, recentDecisions: [], importDecisions: () => {} })), parseRecentConflictDecision: () => null },
    "./entityJournalStore": { useEntityJournalStore: createStore(() => ({ ...ready, entries: [], importEntries: () => {} })) },
    "./reviewStore": { useReviewStore: createStore(() => ({ reviews: {}, restoreAll: () => {} })) },
    "./statusStore": { useStatusStore: createStore(() => ({ statuses: {}, restoreAll: () => {} })) },
    "./tagsStore": { useTagsStore: createStore(() => ({ tags: {}, restoreAll: () => {} })) },
  };
  for (const [path, module] of Object.entries(modules)) vi.doMock(path, () => module);
  const { useTravelMetadataStore: travel } = await import("./travelMetadataStore");
  const runtime = await import("./profileRuntime");
  const { createRepressurizerProfile: create, parseRepressurizerProfile: parse } = await import("../lib/repressurizerProfile");
  const document = (sections: Parameters<typeof create>[0]["sections"]) => create({ profileId: "test", name: "Travel", deviceId: "test-device", steamAccountId: null, sections });
  return { travel, runtime, document, parse, queue, disk, writes, mirror, settings, notes,
    generation: () => generation,
    setRead: (next: typeof readFile) => { readFile = next; },
    setWrite: (next: typeof writeFile) => { writeFile = next; },
    ready: async () => { await runtime.ensureProfileHistoryReady(); await queue.flushPersistence(); writes.length = 0; },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("profile travel runtime and persistence", () => {
  it("hydrates notes before a profile capture, even without exported history", async () => {
    const f = await fixture(async () => persisted({ 10: note(true) }));
    assert.equal(Object.hasOwn(f.runtime.captureProfileSections(false).preferences!, "travel"), false);
    await f.ready();
    const doc = f.document(f.runtime.captureProfileSections(false));
    assert.deepEqual((doc.sections.preferences as { travel: unknown }).travel, { 10: note(true) });
    assert.equal(f.parse(doc).error, null);
  });
  it("refuses a failed read instead of exporting an empty map and can retry", async () => {
    const f = await fixture(async () => { throw new Error("disk unreadable"); });
    await assert.rejects(f.ready, /Travel metadata could not be loaded/);
    assert.equal(f.travel.getState().hydrated, false); assert.equal(f.writes.length, 0);
    f.setRead(async () => persisted({ 10: note(true) }));
    await f.ready(); assert.deepEqual(f.travel.getState().records, { 10: note(true) });
  });
  it("refuses corrupt persisted notes without overwriting them", async () => {
    const f = await fixture(async () => "{corrupt");
    await assert.rejects(f.ready, /Travel metadata could not be loaded/);
    assert.equal(f.writes.length, 0); assert.equal(f.travel.getState().hydrated, false);
  });
  it("replays an edit during hydration without erasing other durable fields", async () => {
    let finish!: (raw: string) => void;
    const f = await fixture(() => new Promise(resolve => { finish = resolve; }));
    const loading = f.runtime.ensureProfileHistoryReady();
    await Promise.resolve(); await Promise.resolve();
    f.travel.getState().setMetadata(10, { offline: true });
    finish(persisted({ 10: { ...note(), sizeBytes: 512 } }));
    await loading; await f.queue.flushPersistence();
    assert.deepEqual(f.travel.getState().records[10], { ...note(true), sizeBytes: 512 });
  });
  it("guards import before any live preference changes when travel is not loaded", async () => {
    const f = await fixture();
    const doc = f.document({ preferences: { notes: { 10: "incoming" }, travel: { 10: note(true) } } });
    assert.throws(() => f.runtime.applyProfileSections(doc, prefs), /Load travel metadata/);
    assert.deepEqual(f.notes.getState().notes, {}); assert.equal(f.writes.length, 0);
  });
  it("applies imported notes, saves them, and detaches caller-owned records", async () => {
    const f = await fixture(); await f.ready();
    const data = { 10: note(false) }; const doc = f.document({ preferences: { travel: data } });
    f.runtime.applyProfileSections(doc, prefs);
    (doc.sections.preferences as { travel: typeof data }).travel[10].offline = true;
    await f.queue.flushPersistence();
    assert.deepEqual(f.travel.getState().records, data);
    assert.deepEqual(JSON.parse(f.disk.get(key)!).records, data);
    assert.deepEqual(JSON.parse(f.mirror.get(mirrorKey)!).records, data);
    assert.equal(f.generation(), 1);
  });
  it("leaves notes intact when an old profile has no travel field", async () => {
    const f = await fixture(async () => persisted({ 10: note(true) })); await f.ready();
    f.runtime.applyProfileSections(f.document({ preferences: { notes: { 20: "old profile" } } }), prefs);
    await f.queue.flushPersistence();
    assert.deepEqual(f.travel.getState().records, { 10: note(true) }); assert.equal(f.writes.length, 0);
  });
  it("does not apply travel when preferences are deselected", async () => {
    const f = await fixture(async () => persisted({ 10: note(true) })); await f.ready();
    f.runtime.applyProfileSections(f.document({ preferences: { travel: {} } }), new Set(["planner"]));
    assert.deepEqual(f.travel.getState().records, { 10: note(true) }); assert.equal(f.writes.length, 0);
  });
  it("applies explicit empty maps and persists the removal", async () => {
    const f = await fixture(async () => persisted({ 10: note(true) })); await f.ready();
    f.runtime.applyProfileSections(f.document({ preferences: { travel: {} } }), prefs);
    await f.queue.flushPersistence();
    assert.deepEqual(f.travel.getState().records, {}); assert.deepEqual(JSON.parse(f.disk.get(key)!).records, {});
  });
  it("rejects an invalid record before applying otherwise valid notes", async () => {
    const f = await fixture(); await f.ready();
    const doc = f.document({ preferences: { notes: { 10: "incoming" }, travel: { 10: { sizeBytes: -1 } } } });
    assert.throws(() => f.runtime.applyProfileSections(doc, prefs), /Invalid profile/);
    assert.deepEqual(f.notes.getState().notes, {}); assert.deepEqual(f.travel.getState().records, {}); assert.equal(f.writes.length, 0);
  });
  it("rolls back memory and the mirror and never flushes a rejected profile write", async () => {
    const f = await fixture(async () => persisted({ 10: note(true) })); await f.ready();
    const before = f.mirror.get(mirrorKey);
    f.settings.setState({ setSettings: () => { throw new Error("later section failed"); } });
    const doc = f.document({ preferences: { travel: { 20: note(false) } }, settings: { theme: "dark" } });
    assert.throws(() => f.runtime.applyProfileSections(doc, new Set(["preferences", "settings"])), /later section failed/);
    await Promise.resolve(); await f.queue.flushPersistence();
    assert.deepEqual(f.travel.getState().records, { 10: note(true) });
    assert.equal(f.mirror.get(mirrorKey), before); assert.equal(f.writes.length, 0); assert.equal(f.generation(), 0);
  });
  it("uses the same travel restoration for sync and preserves a later editor change", async () => {
    const f = await fixture(); await f.ready();
    f.runtime.applyProfileSections(f.document({ preferences: { travel: { 10: note(true) } } }), prefs, "sync");
    f.travel.getState().setMetadata(10, { externalLauncher: false });
    await f.queue.flushPersistence();
    assert.deepEqual(JSON.parse(f.disk.get(key)!).records, { 10: { ...note(true), externalLauncher: false } });
  });
  it("flushes imported writes before a fresh hydration reads the durable data", async () => {
    const f = await fixture(); await f.ready();
    f.runtime.applyProfileSections(f.document({ preferences: { travel: { 10: note(true) } } }), prefs);
    f.travel.setState({ records: {}, hydrated: false });
    await f.travel.getState().hydrate();
    assert.deepEqual(f.travel.getState().records, { 10: note(true) });
  });
  it("rejects unhydrated direct restores and malformed replacement maps", async () => {
    const f = await fixture();
    assert.throws(() => f.travel.getState().restoreAll({ 10: note() }), /Load travel metadata/);
    await f.ready(); assert.throws(() => f.travel.getState().restoreAll({ "10": note(), "010": note() }), /Duplicate/);
    assert.equal(f.writes.length, 0);
  });
  it("surfaces a durable write failure through flush rather than reporting a successful save", async () => {
    const f = await fixture(); await f.ready();
    f.setWrite(async () => { throw new Error("write failed"); });
    f.travel.getState().restoreAll({ 10: note(true) });
    await assert.rejects(f.queue.flushPersistence(), /write failed/);
    assert.deepEqual(f.travel.getState().records, { 10: note(true) });
  });
});
