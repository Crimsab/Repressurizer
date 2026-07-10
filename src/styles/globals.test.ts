import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest runs in Node while the app tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";

const stylesheet = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function themeBlock(selector: "@theme" | ".theme-dim" | ".theme-light"): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing theme block: ${selector}`);
  return match[1];
}

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`--color-repressurizer-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing color token: ${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = hex.match(/[0-9a-fA-F]{2}/g)?.map((value) => parseInt(value, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("theme text contrast", () => {
  for (const selector of ["@theme", ".theme-dim", ".theme-light"] as const) {
    it(`${selector} keeps secondary text readable on base surfaces`, () => {
      const block = themeBlock(selector);
      for (const textToken of ["text-muted", "text-faint"]) {
        for (const surfaceToken of ["bg", "surface"]) {
          expect(
            contrast(token(block, textToken), token(block, surfaceToken)),
            `${selector} ${textToken} on ${surfaceToken}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
