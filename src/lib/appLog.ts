import { debug, error, info, warn } from "@tauri-apps/plugin-log";
import { redactLogMessage, redactLogValue } from "./logRedaction";

type LogContext = Record<string, unknown>;
type LogWriter = (message: string) => Promise<void>;
type ConsoleWriter = (message?: unknown, ...optionalParams: unknown[]) => void;

function redactContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, redactLogValue(value, key)])
  );
}

function format(message: string, context?: LogContext): string {
  const safeMessage = redactLogMessage(message);
  if (!context || Object.keys(context).length === 0) return safeMessage;
  try {
    return `${safeMessage} ${JSON.stringify(redactContext(context))}`;
  } catch {
    return safeMessage;
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
