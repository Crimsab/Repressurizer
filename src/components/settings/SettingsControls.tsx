import type { ReactNode } from "react";

export function NumberSetting({
  label,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="truncate text-xs text-repressurizer-text-muted">{label}</p>
        <span className="font-mono text-xs tabular-nums text-repressurizer-accent">
          {value}{suffix ? ` ${suffix}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-repressurizer-accent"
      />
    </div>
  );
}

export function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`btn-press flex w-full cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
        checked
          ? "border-repressurizer-accent bg-repressurizer-accent/10"
          : "border-repressurizer-border-subtle bg-repressurizer-bg hover:border-repressurizer-border"
      }`}
    >
      <span className={`mt-0.5 ${checked ? "text-repressurizer-accent" : "text-repressurizer-text-faint"}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-repressurizer-text">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">{description}</p>
      </div>
      <span
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          checked
            ? "border-repressurizer-accent bg-repressurizer-accent/20"
            : "border-repressurizer-border bg-repressurizer-surface"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full transition-transform ${
            checked ? "translate-x-[22px] bg-repressurizer-accent" : "translate-x-[3px] bg-repressurizer-text-muted"
          }`}
        />
      </span>
    </button>
  );
}
