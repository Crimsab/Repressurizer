import { describe, expect, it } from "vitest";
import { sortAutoCategorizePreviewEntries } from "./autoCategorizePreview";

describe("sortAutoCategorizePreviewEntries", () => {
  it("sorts by game count first", () => {
    const entries = sortAutoCategorizePreviewEntries(
      {
        C: [1],
        A: [1, 2, 3],
        B: [1, 2],
      },
      "count"
    );

    expect(entries.map(([name]) => name)).toEqual(["A", "B", "C"]);
  });

  it("sorts hours by configured bucket order", () => {
    const entries = sortAutoCategorizePreviewEntries(
      {
        "ORE:100h+": [1],
        "ORE:1-10h": [1, 2, 3],
        "ORE:Unplayed": [1, 2],
      },
      "natural",
      {
        type: "hours",
        config: {
          prefix: "ORE:",
          rules: [
            { name: "Unplayed", min_hours: 0, max_hours: 0.01 },
            { name: "1-10h", min_hours: 1, max_hours: 10 },
            { name: "100h+", min_hours: 100, max_hours: 0 },
          ],
        },
      }
    );

    expect(entries.map(([name]) => name)).toEqual([
      "ORE:Unplayed",
      "ORE:1-10h",
      "ORE:100h+",
    ]);
  });

  it("sorts years chronologically and leaves unknown last", () => {
    const entries = sortAutoCategorizePreviewEntries(
      {
        "Year: Unknown Year": [1, 2, 3],
        "Year: 2020": [1],
        "Year: 2014": [1, 2],
      },
      "natural",
      { type: "year", config: { prefix: "Year: " } }
    );

    expect(entries.map(([name]) => name)).toEqual([
      "Year: 2014",
      "Year: 2020",
      "Year: Unknown Year",
    ]);
  });

  it("sorts name buckets like a library index", () => {
    const entries = sortAutoCategorizePreviewEntries(
      {
        "(Name) Other": [1],
        "(Name) B": [1],
        "(Name) #": [1],
        "(Name) A": [1],
      },
      "natural",
      { type: "name", config: { prefix: "(Name) " } }
    );

    expect(entries.map(([name]) => name)).toEqual([
      "(Name) #",
      "(Name) A",
      "(Name) B",
      "(Name) Other",
    ]);
  });

  it("sorts Steam review buckets in Depressurizer order", () => {
    const entries = sortAutoCategorizePreviewEntries(
      {
        "Score: Mixed": [1],
        "Score: Overwhelmingly Positive": [1, 2],
        "Score: Very Negative": [3],
        "Score: Positive": [4],
      },
      "natural",
      { type: "rating", config: { prefix: "Score: " } }
    );

    expect(entries.map(([name]) => name)).toEqual([
      "Score: Overwhelmingly Positive",
      "Score: Positive",
      "Score: Mixed",
      "Score: Very Negative",
    ]);
  });
});
