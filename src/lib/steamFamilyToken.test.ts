import { describe, expect, it } from "vitest";
import { extractStoreWebApiToken } from "./steamFamilyToken";

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
});
