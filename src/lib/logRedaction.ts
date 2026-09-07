const SENSITIVE_KEY_PATTERN = /(^key$|api.?key|token|secret|password|authorization|bearer)/i;
const QUERY_PARAMETER_PATTERN = /([?&])([^=&#\s"']+)=([^&#\s"']*)/g;
// Consume escaped quotes as part of the value, not as the end of a secret.
const QUOTED_FIELD_PATTERN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')(\s*:\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
const AUTH_SCHEME_PATTERN = /(\b(?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=-]+/gi;
const URL_CREDENTIALS_PATTERN = /(\bhttps?:\/\/)[^/\s@?#]+@/gi;
const MAX_REDACTION_DEPTH = 40;

function decodeQueryKey(key: string): string {
  try {
    return decodeURIComponent(key.replace(/\+/g, " "));
  } catch {
    return key;
  }
}

function decodeQuotedKey(key: string): string {
  if (key.startsWith('"')) {
    try {
      return JSON.parse(key) as string;
    } catch {
      // Continue with the literal key when a log fragment is not valid JSON.
    }
  }
  return key.slice(1, -1).replace(/\\(.)/g, "$1");
}

function redactString(value: string): string {
  return value
    .replace(QUERY_PARAMETER_PATTERN, (match, separator: string, key: string) =>
      SENSITIVE_KEY_PATTERN.test(decodeQueryKey(key)) ? `${separator}${key}=***` : match,
    )
    .replace(QUOTED_FIELD_PATTERN, (match, key: string, separator: string, quotedValue: string) =>
      SENSITIVE_KEY_PATTERN.test(decodeQuotedKey(key))
        ? `${key}${separator}${quotedValue[0]}***${quotedValue[0]}` : match,
    )
    .replace(AUTH_SCHEME_PATTERN, "$1***")
    .replace(URL_CREDENTIALS_PATTERN, "$1***@");
}

export function redactLogValue(value: unknown, key = ""): unknown {
  const ancestors = new WeakSet<object>();
  function visit(entry: unknown, entryKey: string, depth: number): unknown {
    if (SENSITIVE_KEY_PATTERN.test(entryKey)) {
      return entry === null || entry === undefined || entry === "" ? entry : "***";
    }
    if (typeof entry === "string") return redactString(entry);
    if (typeof entry === "bigint") return entry.toString();
    if (!entry || typeof entry !== "object") return entry;
    if (ancestors.has(entry)) return "[Circular]";
    if (depth >= MAX_REDACTION_DEPTH) return "[MaxDepth]";
    ancestors.add(entry);
    try {
      if (Array.isArray(entry)) return entry.map((item) => visit(item, "", depth + 1));
      return Object.fromEntries(
        Object.entries(entry).map(([childKey, childValue]) => [
          childKey,
          visit(childValue, childKey, depth + 1),
        ]),
      );
    } finally {
      ancestors.delete(entry);
    }
  }
  return visit(value, key, 0);
}

export function redactLogMessage(message: string): string {
  return redactString(message);
}
