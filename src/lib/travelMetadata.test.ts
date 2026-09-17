import { describe, expect, it } from "vitest";
import { EMPTY_TRAVEL_METADATA, mergeTravelMetadata, normalizeTravelAppId, normalizeTravelMetadataRecord,
  normalizeTravelMetadataPatch, parseTravelMetadata, serializeTravelMetadata } from "./travelMetadata";

describe("Travel metadata identity and persistence", () => {
  for (const value of [true, false, [1], {}, Symbol("id"), "0x10", "1e3", " 1 ", -1, 0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    it(`rejects invalid app identity ${String(value)}`, () => expect(normalizeTravelAppId(value)).toBe(null));
  }
  it("accepts exact positive decimal identities", () => {
    expect(normalizeTravelAppId(42)).toBe(42);
    expect(normalizeTravelAppId("42")).toBe(42);
    expect(normalizeTravelAppId("0042")).toBe(42);
    expect(normalizeTravelAppId(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("rejects duplicate normalized identities instead of overwriting one record", () => {
    expect(() => parseTravelMetadata('{"version":1,"records":{"1":{"offline":true},"01":{"offline":false}}}')).toThrow();
  });
  it("preserves explicit null unknowns during a serialize/parse round trip", () => {
    const records = { 42: { ...EMPTY_TRAVEL_METADATA, offline: false, sizeBytes: 1024 } };
    expect(parseTravelMetadata(serializeTravelMetadata(records))).toEqual(records);
  });
  it("rejects corrupt JSON and unsupported formats", () => {
    for (const raw of ["{", "[]", '{"version":2,"records":{}}', '{"version":1,"records":[]}']) {
      expect(() => parseTravelMetadata(raw)).toThrow();
    }
  });
  it("rejects invalid persisted sizes without treating the file as empty", () => {
    for (const sizeBytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "100", true]) {
      expect(() => parseTravelMetadata(JSON.stringify({ version: 1, records: { 42: { sizeBytes } } }))).toThrow();
    }
  });
  it("keeps absent files and missing optional fields backward compatible", () => {
    expect(parseTravelMetadata(null)).toEqual({});
    expect(parseTravelMetadata('{"version":1,"records":{"42":{"offline":true}}}')).toEqual({ 42: { ...EMPTY_TRAVEL_METADATA, offline: true } });
  });
});

describe("Travel metadata editor patches", () => {
  it("does not erase existing values for explicitly undefined patch properties", () => {
    const current = { offline: true, firstLaunchOnline: false, externalLauncher: false, sizeBytes: 4096 };
    expect(mergeTravelMetadata(current, { offline: undefined, firstLaunchOnline: undefined, externalLauncher: undefined, sizeBytes: undefined })).toEqual(current);
  });
  it("still permits explicit clearing to unknown", () => {
    expect(mergeTravelMetadata({ ...EMPTY_TRAVEL_METADATA, offline: true, sizeBytes: 4096 }, { offline: null, sizeBytes: null })).toEqual(EMPTY_TRAVEL_METADATA);
  });
  it("does not coerce a boolean, array, object or unsafe number into a size", () => {
    for (const sizeBytes of [true, [1024], {}, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
      expect(normalizeTravelMetadataRecord({ sizeBytes })?.sizeBytes).toBe(null);
    }
  });
  it("keeps numeric editor input normalization", () => {
    expect(normalizeTravelMetadataRecord({ sizeBytes: "1024" })?.sizeBytes).toBe(1024);
    expect(normalizeTravelMetadataRecord({ sizeBytes: 10.9 })?.sizeBytes).toBe(10);
  });
  it("rejects non-record objects", () => {
    expect(normalizeTravelMetadataRecord(new Date())).toBe(null);
    expect(normalizeTravelMetadataPatch([])).toEqual({});
  });
  it("does not mutate the input record", () => {
    const original = { ...EMPTY_TRAVEL_METADATA, offline: true };
    expect(mergeTravelMetadata(original, { offline: false }).offline).toBe(false);
    expect(original.offline).toBe(true);
  });
});
