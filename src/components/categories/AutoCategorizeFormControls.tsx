import { useMemo, useState, type ReactNode } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5 font-mono text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
      />
    </label>
  );
}

export function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text transition-colors hover:border-repressurizer-border">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-repressurizer-border bg-repressurizer-bg accent-repressurizer-accent"
      />
      <span>{label}</span>
    </label>
  );
}

export function MetadataStatus({
  label,
  valueCount,
  gameCount,
  totalDetails,
}: {
  label: string;
  valueCount: number;
  gameCount: number;
  totalDetails: number;
}) {
  const t = useT();
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-repressurizer-text-faint">
      <span className="rounded-md bg-repressurizer-surface-hover px-2 py-0.5">
        {label}: <span className="font-mono text-repressurizer-text tabular-nums">{valueCount}</span>
      </span>
      <span className="rounded-md bg-repressurizer-surface-hover px-2 py-0.5">
        {t("auto.metadataCoverage", { count: gameCount, total: totalDetails })}
      </span>
    </div>
  );
}

export function TagListInput({
  label,
  items,
  newItem,
  setNewItem,
  onAddItem,
  onRemove,
  suggestions = [],
  status,
}: {
  label: string;
  items: string[];
  newItem: string;
  setNewItem: (v: string) => void;
  onAddItem: (v: string) => void;
  onRemove: (v: string) => void;
  suggestions?: string[];
  status?: ReactNode;
}) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const normalizedItems = useMemo(() => new Set(items.map((item) => item.toLocaleLowerCase())), [items]);
  const query = newItem.trim().toLocaleLowerCase();
  const visibleSuggestions = useMemo(
    () =>
      suggestions
        .filter((item) => !normalizedItems.has(item.toLocaleLowerCase()))
        .filter((item) => !query || item.toLocaleLowerCase().includes(query))
        .slice(0, 24),
    [normalizedItems, query, suggestions]
  );
  const shouldShowSuggestions = suggestions.length > 0 && (focused || query.length > 0);

  const addValue = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (!normalizedItems.has(value.toLocaleLowerCase())) {
      onAddItem(value);
    }
    setNewItem("");
    setFocused(false);
  };

  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{label}</label>
      {status}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addValue(newItem);
            }
          }}
          placeholder={t("auto.typeEnter")}
          className="flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
        />
        <button onClick={() => addValue(newItem)} className="btn-press flex items-center justify-center w-8 h-8 rounded-lg bg-repressurizer-accent/15 text-repressurizer-accent hover:bg-repressurizer-accent/25">
          <Plus size={14} weight="bold" />
        </button>
      </div>
      {shouldShowSuggestions && (
        <div className="mb-2 max-h-32 overflow-auto rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-2">
          {visibleSuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addValue(item)}
                  className="btn-press rounded-md border border-repressurizer-border-subtle bg-repressurizer-surface px-2 py-1 text-xs text-repressurizer-text transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-2 py-1 text-xs text-repressurizer-text-faint">
              {t("auto.noSuggestions")}
            </p>
          )}
        </div>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-md bg-repressurizer-surface-hover px-2.5 py-1 text-xs text-repressurizer-text">
              {item}
              <button onClick={() => onRemove(item)} className="text-repressurizer-text-faint hover:text-repressurizer-danger ml-0.5">
                <X size={11} weight="bold" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

