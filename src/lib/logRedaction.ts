const SENSITIVE_KEY_PATTERN = /(api.?key|token|secret|password|authorization|bearer)/i;
const SENSITIVE_QUERY_PATTERN = /([?&](?:key|api_?key|access_token|token|secret|password)=)[^&#\s"']*/gi;
const SENSITIVE_JSON_PATTERN = /(["'](?:key|api_?key|access_token|token|secret|password)["']\s*:\s*["'])[^"']*/gi;
const BEARER_PATTERN = /(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi;

function redactString(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_PATTERN, "$1***")
    .replace(SENSITIVE_JSON_PATTERN, "$1***")
    .replace(BEARER_PATTERN, "$1***");
}

export function redactLogValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return value ? "***" : value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((entry) => redactLogValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactLogValue(entryValue, entryKey),
      ])
    );
  }
  return value;
}

export function redactLogMessage(message: string): string {
  return redactString(message);
}
