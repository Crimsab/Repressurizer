import { describe, expect, it } from "vitest";
import { isTransientMessageError } from "./useTransientMessage";

describe("isTransientMessageError", () => {
  it("recognizes the localized failure wording used by Settings", () => {
    expect(isTransientMessageError("Backup failed")).toBe(true);
    expect(isTransientMessageError("Importazione non riuscita")).toBe(true);
    expect(isTransientMessageError("Errore durante il ripristino")).toBe(true);
  });

  it("keeps success feedback on the normal timeout", () => {
    expect(isTransientMessageError("Backup created")).toBe(false);
    expect(isTransientMessageError("Impostazioni salvate")).toBe(false);
  });
});
