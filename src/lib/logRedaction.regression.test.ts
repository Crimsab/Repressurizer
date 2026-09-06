import { describe, expect, it } from "vitest";
import { redactLogMessage, redactLogValue } from "./logRedaction";

describe("log redaction regressions", () => {
  it("redacts generic key fields in structured contexts", () => {
    expect(redactLogValue({ key: "sensitive", appid: 10 })).toEqual({ key: "***", appid: 10 });
  });

  it("redacts prefixed and camelCase token fields in log text", () => {
    const value = 'Response {"steamFamilyAccessToken":"sensitive","refresh_token":"other","appid":"10"}';
    expect(redactLogMessage(value)).toBe('Response {"steamFamilyAccessToken":"***","refresh_token":"***","appid":"10"}');
  });

  it("redacts the complete value when a JSON secret contains escaped quotes", () => {
    const value = JSON.stringify({ password: 'prefix"TAIL_SECRET', appid: 10 });
    expect(redactLogMessage(value)).toBe('{"password":"***","appid":10}');
  });

  it("redacts escaped JSON keys", () => {
    expect(redactLogMessage('{"api\\u004bey":"sensitive"}')).toBe('{"api\\u004bey":"***"}');
  });

  it("redacts sensitive URL query names after percent decoding", () => {
    const value = "https://example.test/?accessToken=one&refresh_token=two&%61piKey=three&appid=10";
    expect(redactLogMessage(value)).toBe("https://example.test/?accessToken=***&refresh_token=***&%61piKey=***&appid=10");
  });

  it("preserves non-sensitive query values", () => {
    expect(redactLogMessage("https://example.test/?appid=10&lang=it")).toBe("https://example.test/?appid=10&lang=it");
  });

  it("does not throw on invalid percent encoding", () => {
    expect(redactLogMessage("https://example.test/?apiKey%=sensitive")).toBe("https://example.test/?apiKey%=***");
  });

  it("redacts Basic and Bearer authorization credentials", () => {
    expect(redactLogMessage("Authorization: Basic YTpi; Bearer header.payload.signature")).toBe("Authorization: Basic ***; Bearer ***");
  });

  it("redacts URL user info", () => {
    expect(redactLogMessage("POST https://name:password@example.test/api")).toBe("POST https://***@example.test/api");
  });

  it("does not mistake an at-sign in the query for URL credentials", () => {
    expect(redactLogMessage("https://example.test?email=a@b.test")).toBe("https://example.test?email=a@b.test");
  });

  it("retains existing support for single-quoted fields", () => {
    expect(redactLogMessage("{'api_key': 'sensitive', 'appid': '10'}")).toBe("{'api_key': '***', 'appid': '10'}");
  });

  it("retains existing structured nested redaction", () => {
    expect(redactLogValue({ items: [{ apiKey: "a", authorization: "b", count: 3 }] })).toEqual({ items: [{ apiKey: "***", authorization: "***", count: 3 }] });
  });

  it("preserves empty optional credentials", () => {
    expect(redactLogValue({ token: "", apiKey: null, password: undefined })).toEqual({ token: "", apiKey: null, password: undefined });
  });

  it("handles cycles without dropping all diagnostic context", () => {
    const value: Record<string, unknown> = { appid: 10, token: "sensitive" };
    value.self = value;
    expect(redactLogValue(value)).toEqual({ appid: 10, token: "***", self: "[Circular]" });
  });

  it("handles cyclic arrays", () => {
    const value: unknown[] = [];
    value.push(value);
    expect(redactLogValue(value)).toEqual(["[Circular]"]);
  });

  it("does not classify shared non-cyclic objects as cycles", () => {
    const shared = { token: "sensitive", appid: 10 };
    expect(redactLogValue({ first: shared, second: shared })).toEqual({
      first: { token: "***", appid: 10 }, second: { token: "***", appid: 10 },
    });
  });

  it("converts bigint values to JSON-safe strings", () => {
    expect(redactLogValue({ steamId: BigInt("76561198000000000") })).toEqual({ steamId: "76561198000000000" });
  });

  it("bounds recursion on deeply nested input", () => {
    let value: Record<string, unknown> = { appid: 10 };
    for (let index = 0; index < 1000; index++) value = { next: value };
    expect(JSON.stringify(redactLogValue(value))).toContain("[MaxDepth]");
  });
});
