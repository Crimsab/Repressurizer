import { describe, expect, it } from "vitest";
import {
  extractStoreWebApiToken,
  extractStoreWebApiTokenFromClipboard,
  isSteamFamilyTokenRefreshRecommended,
  STEAM_FAMILY_TOKEN_REFRESH_REMINDER_MS,
} from "./steamFamilyToken";

describe("Steam Family token helpers", () => {
  it("accepts a raw Store webapi_token", () => {
    expect(extractStoreWebApiToken("  abc123  ")).toBe("abc123");
  });

  it("extracts token from the Steam Store async config JSON", () => {
    expect(
      extractStoreWebApiToken(
        JSON.stringify({
          success: 1,
          data: { webapi_token: "store-token" },
        })
      )
    ).toBe("store-token");
  });

  it("extracts token from pasted JSON fragments", () => {
    expect(extractStoreWebApiToken('{ "webapi_token": "fragment-token" }')).toBe(
      "fragment-token"
    );
  });

  it("imports only an explicitly named token from clipboard JSON", () => {
    expect(
      extractStoreWebApiTokenFromClipboard(
        JSON.stringify({ success: 1, data: { webapi_token: "clipboard-token" } })
      )
    ).toBe("clipboard-token");
    expect(extractStoreWebApiTokenFromClipboard("unrelated-password")).toBe("");
    expect(
      extractStoreWebApiTokenFromClipboard(
        JSON.stringify({ data: { access_token: "wrong-secret" } })
      )
    ).toBe("");
  });

  it("keeps the raw-token manual fallback", () => {
    expect(extractStoreWebApiToken("manual-token")).toBe("manual-token");
  });

  it("recommends refreshing an old or never-valid cache without claiming exact expiry", () => {
    const now = 1_800_000_000_000;
    expect(
      isSteamFamilyTokenRefreshRecommended(
        { savedAt: now - STEAM_FAMILY_TOKEN_REFRESH_REMINDER_MS, lastValidatedAt: null },
        now
      )
    ).toBe(true);
    expect(
      isSteamFamilyTokenRefreshRecommended(
        { savedAt: now - STEAM_FAMILY_TOKEN_REFRESH_REMINDER_MS, lastValidatedAt: now - 1 },
        now
      )
    ).toBe(false);
  });
});
