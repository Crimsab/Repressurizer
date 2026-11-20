import { describe, it } from "vitest";
import { assert } from "./testAssert";
import { createRepressurizerProfile, parseRepressurizerProfile, selectProfileSections, diffProfileSections, type RepressurizerProfileDocument } from "./repressurizerProfile";
import { prepareProfileApplication } from "./profileApplication";
import { mergeProfileDocuments, resolveProfileSyncConflicts, profileEntityChanges, createProfileSyncEnvelope, parseProfileSyncEnvelope } from "./profileSync";
import { EMPTY_TRAVEL_METADATA, parseTravelMetadataRecords, type TravelMetadataRecord } from "./travelMetadata";

const record = (patch: Partial<TravelMetadataRecord> = {}): TravelMetadataRecord => ({ ...EMPTY_TRAVEL_METADATA, ...patch });
const profile = (travel?: unknown, extra: Record<string, unknown> = {}): RepressurizerProfileDocument => createRepressurizerProfile({
  profileId: "test-profile", name: "Travel", deviceId: "device-a", steamAccountId: null, exportedAt: 1,
  sections: { preferences: { notes: {}, ...extra, ...(travel === undefined ? {} : { travel }) } },
});
const travelOf = (doc: RepressurizerProfileDocument) => (doc.sections.preferences as { travel?: Record<number, TravelMetadataRecord> })?.travel;
const selected = new Set(["preferences"] as const);

describe("travel notes in portable profiles", () => {
  it("round-trips through JSON with a verified checksum and detached records", () => {
    const data = { 10: record({ offline: true, sizeBytes: 2048 }), 20: record({ externalLauncher: false }) };
    const doc = profile(data);
    data[10].offline = false;
    const parsed = parseRepressurizerProfile(JSON.parse(JSON.stringify(doc)));
    assert.equal(parsed.error, null);
    assert.equal(travelOf(parsed.document!)![10].offline, true);
    assert.equal(doc.manifest.schemaVersion, 1);
  });
  it("includes travel only when preferences are selected", () => {
    const doc = profile({ 10: record() });
    assert.deepEqual(travelOf(selectProfileSections(doc, selected)), travelOf(doc));
    assert.equal(selectProfileSections(doc, new Set(["settings"])).sections.preferences, undefined);
    assert.deepEqual(prepareProfileApplication(doc, new Set(["settings"]), { preferences: {} }), {});
  });
  it("accepts old profiles and does not synthesize a travel deletion on import", () => {
    const doc = profile(undefined, { notes: { 10: "Old note" } });
    assert.equal(parseRepressurizerProfile(doc).error, null);
    const prepared = prepareProfileApplication(doc, selected, profile({ 10: record({ offline: true }) }).sections);
    assert.equal(Object.hasOwn(prepared.preferences!, "travel"), false);
  });
  it("restores explicit nulls regardless of non-null current field types", () => {
    const prepared = prepareProfileApplication(profile({ 10: record() }), selected,
      profile({ 10: record({ offline: true, sizeBytes: 100 }) }).sections);
    assert.deepEqual((prepared.preferences as { travel: unknown }).travel, { 10: record() });
  });
  it("keeps an explicit empty travel map as a replacement", () => {
    const prepared = prepareProfileApplication(profile({}), selected, profile({ 10: record() }).sections);
    assert.deepEqual((prepared.preferences as { travel: unknown }).travel, {});
  });
  it("imports into a runtime that has not captured travel yet", () => {
    const prepared = prepareProfileApplication(profile({ 10: { offline: false } }), selected, { preferences: { notes: {} } });
    assert.deepEqual((prepared.preferences as { travel: unknown }).travel, { 10: record({ offline: false }) });
  });
  it("normalizes IDs and fills absent fields without changing the source checksum", () => {
    const doc = profile({ "010": { offline: true } }); const before = JSON.stringify(doc);
    const prepared = prepareProfileApplication(doc, selected, { preferences: {} });
    assert.deepEqual((prepared.preferences as { travel: unknown }).travel, { 10: record({ offline: true }) });
    assert.equal(JSON.stringify(doc), before);
    assert.equal(parseRepressurizerProfile(doc).error, null);
  });
  it("detects travel changes in the existing preferences diff", () => {
    const diff = diffProfileSections(profile({ 10: record() }).sections, profile({ 10: record({ offline: true }) }).sections);
    assert.equal(diff.find(item => item.section === "preferences")?.status, "changed");
  });
  for (const [label, value] of [
    ["null map", null], ["array map", []], ["string map", "notes"],
    ["zero ID", { 0: record() }], ["negative ID", { "-1": record() }],
    ["unsafe ID", { "9007199254740992": record() }], ["ID alias collision", { "10": record(), "010": record() }],
    ["invalid record", { 10: [] }], ["string offline", { 10: record({ offline: "yes" as never }) }],
    ["numeric online flag", { 10: record({ firstLaunchOnline: 1 as never }) }],
    ["string launcher flag", { 10: record({ externalLauncher: "false" as never }) }],
    ["zero bytes", { 10: record({ sizeBytes: 0 }) }], ["negative bytes", { 10: record({ sizeBytes: -1 }) }],
    ["fractional bytes", { 10: record({ sizeBytes: 1.5 }) }], ["unsafe bytes", { 10: record({ sizeBytes: Number.MAX_SAFE_INTEGER + 1 }) }],
    ["string bytes", { 10: record({ sizeBytes: "100" as never }) }],
  ] as const) {
    it(`rejects ${label} before applying any section`, () => {
      const doc = profile(value);
      assert.equal(parseRepressurizerProfile(doc).error, "invalid");
      assert.throws(() => prepareProfileApplication(doc, selected, { preferences: {} }));
    });
  }
  it("rejects nonfinite raw records before JSON can turn them into null", () => {
    for (const sizeBytes of [NaN, Infinity, -Infinity]) assert.throws(() => parseTravelMetadataRecords({ 10: record({ sizeBytes }) }));
  });
});

describe("travel notes in three-way sync", () => {
  it("merges edits to different games", () => {
    const base = profile({ 10: record(), 20: record() });
    const result = mergeProfileDocuments(base, profile({ 10: record({ offline: true }), 20: record() }), profile({ 10: record(), 20: record({ sizeBytes: 50 }) }));
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(travelOf(result.merged), { 10: record({ offline: true }), 20: record({ sizeBytes: 50 }) });
  });
  it("merges independent fields of the same game", () => {
    const base = profile({ 10: record() });
    const result = mergeProfileDocuments(base, profile({ 10: record({ offline: false }) }), profile({ 10: record({ externalLauncher: true }) }));
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(travelOf(result.merged)?.[10], record({ offline: false, externalLauncher: true }));
  });
  it("exposes genuine conflicts and resolves each local, remote, or base choice", () => {
    const result = mergeProfileDocuments(profile({ 10: record() }), profile({ 10: record({ offline: true }) }), profile({ 10: record({ offline: false }) }));
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].path, "sections.preferences.travel.10.offline");
    for (const [choice, value] of [["local", true], ["remote", false], ["base", null]] as const) {
      const resolved = resolveProfileSyncConflicts(result, { [result.conflicts[0].path]: choice });
      assert.equal(travelOf(resolved)?.[10].offline, value);
      assert.equal(parseRepressurizerProfile(resolved).error, null);
    }
  });
  it("resolves an absent base field to unknown on first sync", () => {
    const result = mergeProfileDocuments(null, profile({ 10: record({ offline: true }) }), profile({ 10: record({ offline: false }) }));
    const resolved = resolveProfileSyncConflicts(result, Object.fromEntries(result.conflicts.map(item => [item.path, "base" as const])));
    assert.equal(travelOf(resolved)?.[10].offline, null);
    assert.equal(parseRepressurizerProfile(resolved).error, null);
  });
  it("propagates explicit removal when the other device has not edited the record", () => {
    const base = profile({ 10: record({ offline: true }) });
    const result = mergeProfileDocuments(base, base, profile({}));
    assert.deepEqual(result.conflicts, []); assert.deepEqual(travelOf(result.merged), {});
  });
  it("keeps delete-versus-edit conflicts resolvable instead of losing either side", () => {
    const base = profile({ 10: record() });
    const result = mergeProfileDocuments(base, profile({}), profile({ 10: record({ sizeBytes: 50 }) }));
    assert.equal(result.conflicts[0].path, "sections.preferences.travel.10");
    assert.deepEqual(travelOf(resolveProfileSyncConflicts(result, { [result.conflicts[0].path]: "local" })), {});
    assert.deepEqual(travelOf(resolveProfileSyncConflicts(result, { [result.conflicts[0].path]: "remote" })), { 10: record({ sizeBytes: 50 }) });
  });
  for (const omitted of ["local", "remote", "both"] as const) {
    it(`does not treat ${omitted} legacy omission as deletion after a shared base`, () => {
      const base = profile({ 10: record({ offline: true }) });
      const result = mergeProfileDocuments(base, omitted === "remote" ? base : profile(), omitted === "local" ? base : profile());
      assert.deepEqual(result.conflicts, []); assert.deepEqual(travelOf(result.merged), travelOf(base));
    });
  }
  it("keeps newly added notes when the other client predates the extension", () => {
    const local = profile({ 10: record({ offline: true }) });
    for (const base of [null, profile()]) {
      for (const [a, b] of [[local, profile()], [profile(), local]]) {
        const result = mergeProfileDocuments(base, a, b);
        assert.deepEqual(result.conflicts, []); assert.deepEqual(travelOf(result.merged), travelOf(local));
      }
    }
  });
  it("keeps explicit deletion even when the other client omits the extension", () => {
    const result = mergeProfileDocuments(profile({ 10: record() }), profile({}), profile());
    assert.deepEqual(result.conflicts, []); assert.deepEqual(travelOf(result.merged), {});
  });
  it("normalizes alias IDs before merging and does not mutate inputs", () => {
    const base = profile({ "010": record() }); const local = profile({ 10: record({ offline: true }) }); const remote = profile({ "010": record({ sizeBytes: 50 }) });
    const before = JSON.stringify([base, local, remote]);
    const result = mergeProfileDocuments(base, local, remote);
    assert.deepEqual(travelOf(result.merged), { 10: record({ offline: true, sizeBytes: 50 }) });
    assert.equal(JSON.stringify([base, local, remote]), before);
  });
  it("journals travel creates, edits and deletes but not legacy omissions", () => {
    const empty = profile({}); const one = profile({ 10: record() }); const edit = profile({ 10: record({ offline: true }) });
    for (const [a, b, operation] of [[empty, one, "create"], [one, edit, "update"], [one, empty, "delete"]] as const) {
      const entries = profileEntityChanges(a, b).filter(item => item.entityId === "travel:10");
      assert.equal(entries.length, 1); assert.equal(entries[0].operation, operation); assert.equal(entries[0].entityType, "preference");
    }
    assert.equal(profileEntityChanges(one, profile()).filter(item => item.entityId.startsWith("travel:")).length, 0);
  });
  it("verifies sync envelopes including travel notes and rejects tampering", () => {
    const envelope = createProfileSyncEnvelope({ deviceId: "a", sequence: 1, previousChecksum: null, journal: [], profile: profile({ 10: record() }) });
    assert.ok(parseProfileSyncEnvelope(JSON.parse(JSON.stringify(envelope))));
    travelOf(envelope.profile)![10].offline = true;
    assert.equal(parseProfileSyncEnvelope(envelope), null);
  });
});
