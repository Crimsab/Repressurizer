import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  compactJournal,
  createJournalEntry,
  entityChecksum,
} from "./entityJournal";

describe("entity journal", () => {
  it("produces the same checksum regardless of object key order", () => {
    expect(entityChecksum({ b: 2, a: { d: 4, c: 3 } })).toBe(
      entityChecksum({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("creates deterministic, device-scoped journal identities", () => {
    const input = {
      deviceId: "device-a",
      sequence: 4,
      entityType: "planner-preset" as const,
      entityId: "deck-night",
      operation: "update" as const,
      value: { minutes: 90 },
      changedAt: 10,
    };
    expect(createJournalEntry(input)).toEqual(createJournalEntry(input));
    expect(createJournalEntry(input).id).not.toBe(
      createJournalEntry({ ...input, deviceId: "device-b" }).id,
    );
  });

  it("compacts old entries while preserving the latest state of every entity", () => {
    const entries = [
      createJournalEntry({ deviceId: "a", sequence: 1, entityType: "preference", entityId: "theme", operation: "update", value: "dark" }),
      createJournalEntry({ deviceId: "a", sequence: 2, entityType: "preference", entityId: "theme", operation: "update", value: "light" }),
      createJournalEntry({ deviceId: "a", sequence: 3, entityType: "profile", entityId: "main", operation: "create", value: {} }),
      createJournalEntry({ deviceId: "a", sequence: 4, entityType: "profile", entityId: "travel", operation: "create", value: {} }),
    ];

    const compacted = compactJournal(entries, 2);
    expect(compacted.map((entry) => entry.sequence)).toEqual([2, 3, 4]);
  });
});
