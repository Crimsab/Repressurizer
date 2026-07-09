import { describe, expect, it } from "vitest";
import { redactLogMessage, redactLogValue } from "./logRedaction";

describe("log redaction", () => {
  it("removes secrets embedded in request error URLs", () => {
    const secret = "sentinel-steam-secret";
    const message = `request failed for https://example.test/?key=${secret}&steamid=123`;

    expect(redactLogMessage(message)).not.toContain(secret);
    expect(redactLogMessage(message)).toContain("key=***");
  });

  it("redacts sensitive values recursively", () => {
    const secret = "sentinel-access-token";
    const redacted = JSON.stringify(
      redactLogValue({ error: `Bearer ${secret}`, nested: { accessToken: secret } })
    );

    expect(redacted).not.toContain(secret);
    expect(redacted).toContain("***");
  });
});
