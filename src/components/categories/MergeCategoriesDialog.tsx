import { useState } from "react";
import { useCategoryStore } from "../../stores/categoryStore";
import { useT } from "../../lib/i18n";
import { X, ArrowsMerge } from "@phosphor-icons/react";
import { SelectMenu } from "../ui/SelectMenu";

interface MergeCategoriesDialogProps {
  selectedKeys: string[];
  onClose: () => void;
}

export function MergeCategoriesDialog({ selectedKeys, onClose }: MergeCategoriesDialogProps) {
  const collections = useCategoryStore((s) => s.collections);
  const mergeCategoriesIntoTarget = useCategoryStore((s) => s.mergeCategoriesIntoTarget);
  const mergeSelectedIntoNewCategory = useCategoryStore((s) => s.mergeSelectedIntoNewCategory);
  const t = useT();

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [targetKey, setTargetKey] = useState<string>(selectedKeys[0] ?? "");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  const userCats = collections.filter((c) => !c.is_dynamic && c.id !== "hidden");

  const handleMerge = () => {
    setError("");
    if (selectedKeys.length < 2) {
      setError(t("merge.needTwo"));
      return;
    }
    if (mode === "new") {
      const name = newName.trim();
      if (!name) {
        setError(t("merge.nameRequired"));
        return;
      }
      mergeSelectedIntoNewCategory(selectedKeys, name);
    } else {
      if (!targetKey || !selectedKeys.includes(targetKey)) {
        setError(t("merge.pickTarget"));
        return;
      }
      mergeCategoriesIntoTarget(selectedKeys, targetKey);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowsMerge size={20} className="text-repressurizer-accent" />
            <h2 className="text-base font-semibold text-white">{t("merge.title")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press rounded-lg p-1.5 text-repressurizer-text-muted hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-repressurizer-text-muted mb-4">
          {t("merge.subtitle", { count: selectedKeys.length })}
        </p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-colors ${
              mode === "existing"
                ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border"
            }`}
          >
            {t("merge.intoExisting")}
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-colors ${
              mode === "new"
                ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border"
            }`}
          >
            {t("merge.newCategory")}
          </button>
        </div>

        {mode === "existing" ? (
          <div className="mb-4">
            <SelectMenu
              label={t("merge.targetLabel")}
              value={targetKey}
              onChange={setTargetKey}
              options={selectedKeys.flatMap((k) => {
                const c = userCats.find((x) => x.key === k);
                return c ? [{ value: k, label: `${c.name} (${c.added.length})` }] : [];
              })}
            />
          </div>
        ) : (
          <label className="block mb-4">
            <span className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint">{t("merge.newNameLabel")}</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("merge.newNamePlaceholder")}
              className="mt-1 w-full rounded-xl border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
            />
          </label>
        )}

        {error && (
          <p className="text-sm text-repressurizer-danger mb-4">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-press rounded-xl px-4 py-2 text-sm text-repressurizer-text-muted hover:text-white"
          >
            {t("merge.cancel")}
          </button>
          <button
            type="button"
            onClick={handleMerge}
            className="btn-press rounded-xl bg-repressurizer-accent px-4 py-2 text-sm font-medium text-white hover:bg-repressurizer-accent-hover"
          >
            {t("merge.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
