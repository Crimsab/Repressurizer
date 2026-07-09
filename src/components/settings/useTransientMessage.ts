import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ERROR_MESSAGE_PATTERN = /(failed|fallit|error|errore|could not|non riusc)/i;

export function isTransientMessageError(message: string): boolean {
  return ERROR_MESSAGE_PATTERN.test(message);
}

/** Owns the single dismiss timer for Settings feedback messages. */
export function useTransientMessage(defaultTtlMs = 5_000, errorTtlMs = 8_000) {
  const [message, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const clearMessage = useCallback(() => {
    clearTimer();
    setValue("");
  }, [clearTimer]);

  const setMessage = useCallback((next: string, ttlMs?: number) => {
    clearTimer();
    setValue(next);
    if (!next) return;

    const ttl = ttlMs ?? (isTransientMessageError(next) ? errorTtlMs : defaultTtlMs);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setValue("");
    }, ttl);
  }, [clearTimer, defaultTtlMs, errorTtlMs]);

  useEffect(() => clearTimer, [clearTimer]);

  const messageIsError = useMemo(() => isTransientMessageError(message), [message]);
  return { message, messageIsError, setMessage, clearMessage };
}
