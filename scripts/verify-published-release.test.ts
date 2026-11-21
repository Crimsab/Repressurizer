import { describe, expect, it } from "vitest";
import { parseChecksums, publishedManifestProblems } from "./verify-published-release";

function signature(version: string | null): string {
  const fields = ["timestamp:1", "file:app.msi"];
  if (version) fields.push(`version:${version}`);
  return Buffer.from(`untrusted comment: x\nRUTsig\ntrusted comment: ${fields.join("\t")}\nglobal\n`).toString("base64");
}

const options = { version: "0.8.9", tag: "v0.8.9", repository: "Crimsab/Repressurizer" };
const manifest = (version: string, signed: string | null, tag = "v0.8.9") => ({
  version,
  platforms: {
    "windows-x86_64-stable": {
      url: `https://github.com/Crimsab/Repressurizer/releases/download/${tag}/Repressurizer_0.8.9_x64_en-US.msi`,
      signature: signature(signed),
    },
  },
});

describe("published release verification", () => {
  it("accepts a manifest that announces and signs the release", () => {
    expect(publishedManifestProblems("windows-x86_64-stable", manifest("0.8.9", "0.8.9"), options)).toEqual([]);
  });

  it("reports a stale manifest, a foreign tag and an unbound signature", () => {
    expect(publishedManifestProblems("windows-x86_64-stable", manifest("0.8.8", null, "v0.8.8"), options)).toEqual([
      "windows-x86_64-stable: announces 0.8.8, expected 0.8.9",
      "windows-x86_64-stable: url does not point at v0.8.9",
      "windows-x86_64-stable: signature records <none>",
    ]);
  });

  it("reads sha256sum output, including binary-mode markers", () => {
    const sums = parseChecksums(`${"a".repeat(64)}  Repressurizer.msi\n${"B".repeat(64)} *Repressurizer.AppImage\n`);
    expect(sums.get("Repressurizer.msi")).toBe("a".repeat(64));
    expect(sums.get("Repressurizer.AppImage")).toBe("b".repeat(64));
  });
});
