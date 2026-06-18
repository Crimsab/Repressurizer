import { debug, error, info, warn } from "@tauri-apps/plugin-log";

type LogContext = Record<string, unknown>;
type LogWriter = (message: string) => Promise<void>;
type ConsoleWriter = (message?: unknown, ...optionalParams: unknown[]) => void;

const SENSITIVE_KEY_PATTERN = /(api.?key|token|secret|password|authorization|bearer)/i;

function redactValue(key: string, value: unknown): unknown {
  if (!SENSITIVE_KEY_PATTERN.test(key)) return value;
  if (typeof value === "string" && value.length > 4) return `***${value.slice(-4)}`;
  return value ? "***" : value;
}

function redactContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, redactValue(key, value)])
  );
}

function format(message: string, context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) return message;
  try {
    return `${message} ${JSON.stringify(redactContext(context))}`;
  } catch {
    return message;
  }
}

async function write(
  writer: LogWriter,
  consoleWriter: ConsoleWriter,
  message: string,
  context?: LogContext
) {
  const formatted = format(message, context);
  consoleWriter(formatted);
  try {
    await writer(formatted);
  } catch {
    // Logging must never break the app flow.
  }
}

export const appLog = {
  debug: (message: string, context?: LogContext) => write(debug, console.debug, message, context),
  info: (message: string, context?: LogContext) => write(info, console.info, message, context),
  warn: (message: string, context?: LogContext) => write(warn, console.warn, message, context),
  error: (message: string, context?: LogContext) => write(error, console.error, message, context),
};
