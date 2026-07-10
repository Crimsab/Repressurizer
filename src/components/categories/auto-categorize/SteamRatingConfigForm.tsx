import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CopySimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { defaultSteamRatingRules } from "../../../lib/steamRatings";
import type {
  SteamRatingConfig,
  SteamRatingRule,
} from "../../../lib/tauri";
import { useT } from "../../../lib/i18n";
import { CheckboxRow, NumberField } from "./AutoCategorizeFormControls";
import { PrefixInput } from "./AutoCategorizeBasicForms";

export function SteamRatingConfigForm({
  config,
  onChange,
}: {
  config: SteamRatingConfig;
  onChange: (c: SteamRatingConfig) => void;
}) {
  const t = useT();
  const rules = config.rules?.length ? config.rules : defaultSteamRatingRules();
  const [selected, setSelected] = useState(0);
  const selectedIndex = Math.min(selected, Math.max(0, rules.length - 1));
  const selectedRule = rules[selectedIndex];
  const duplicateNames = new Set(
    rules
      .map((rule) => rule.name.trim())
      .filter((name, index, all) => name && all.indexOf(name) !== index)
  );

  const updateRules = (nextRules: SteamRatingRule[]) => {
    onChange({ ...config, rules: nextRules });
  };
  const updateRule = (index: number, patch: Partial<SteamRatingRule>) => {
    updateRules(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };
  const addRule = () => {
    const next = [
      ...rules,
      { name: t("auto.newRatingRule"), min_score: 0, max_score: 100, min_reviews: 1, max_reviews: 0 },
    ];
    updateRules(next);
    setSelected(next.length - 1);
  };
  const duplicateRule = () => {
    if (!selectedRule) return;
    const next = [
      ...rules.slice(0, selectedIndex + 1),
      { ...selectedRule, name: t("auto.copyName", { name: selectedRule.name }) },
      ...rules.slice(selectedIndex + 1),
    ];
    updateRules(next);
    setSelected(selectedIndex + 1);
  };
  const removeRule = () => {
    if (rules.length <= 1) return;
    const next = rules.filter((_, index) => index !== selectedIndex);
    updateRules(next);
    setSelected(Math.min(selectedIndex, next.length - 1));
  };
  const moveRule = (direction: -1 | 1) => {
    const target = selectedIndex + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    updateRules(next);
    setSelected(target);
  };
  const resetRules = () => {
    updateRules(defaultSteamRatingRules());
    setSelected(0);
  };
  const addMissingDefaultRules = () => {
    const existing = new Set(rules.map((rule) => rule.name.trim().toLocaleLowerCase()).filter(Boolean));
    const missing = defaultSteamRatingRules().filter(
      (rule) => !existing.has(rule.name.trim().toLocaleLowerCase())
    );
    if (missing.length === 0) return;
    updateRules([...rules, ...missing]);
    setSelected(rules.length);
  };

  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4 text-sm text-repressurizer-text-muted">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-medium text-repressurizer-text">{t("auto.steamRatingBuckets")}</p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={addMissingDefaultRules}
              className="btn-press rounded-lg border border-repressurizer-border-subtle px-2 py-1 text-[11px] text-repressurizer-text-faint transition-colors hover:border-repressurizer-border hover:text-repressurizer-text"
            >
              {t("auto.addMissingDefaults")}
            </button>
            <button
              type="button"
              onClick={resetRules}
              className="btn-press rounded-lg border border-repressurizer-danger/30 px-2 py-1 text-[11px] text-repressurizer-danger/70 transition-colors hover:border-repressurizer-danger hover:text-repressurizer-danger"
            >
              {t("auto.replaceWithDefaults")}
            </button>
          </div>
        </div>
        <div className="mb-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
          <CheckboxRow
            label={t("auto.useWilsonScore")}
            checked={config.use_wilson_score ?? false}
            onChange={(checked) => onChange({ ...config, use_wilson_score: checked })}
          />
          <p className="mt-2 text-xs leading-relaxed text-repressurizer-text-faint">
            {t("auto.useWilsonScore.explain")}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
          <div className="min-h-0 space-y-1">
            {rules.map((rule, index) => {
              const duplicate = duplicateNames.has(rule.name.trim());
              return (
                <button
                  key={`${rule.name}-${index}`}
                  type="button"
                  onClick={() => setSelected(index)}
                  className={`btn-press flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                    index === selectedIndex
                      ? "border-repressurizer-accent bg-repressurizer-accent/10"
                      : duplicate
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-repressurizer-border-subtle bg-repressurizer-surface"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-repressurizer-text">{rule.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-repressurizer-accent">
                    {rule.min_score}-{rule.max_score}% · {rule.min_reviews}+
                  </span>
                </button>
              );
            })}
            <div className="grid grid-cols-4 gap-1 pt-1">
              <button type="button" onClick={addRule} className="btn-press flex h-8 items-center justify-center rounded-lg bg-repressurizer-accent/15 text-repressurizer-accent hover:bg-repressurizer-accent/25" title={t("auto.add")}>
                <Plus size={13} weight="bold" />
              </button>
              <button type="button" onClick={duplicateRule} className="btn-press flex h-8 items-center justify-center rounded-lg border border-repressurizer-border-subtle text-repressurizer-text-faint hover:text-repressurizer-text" title={t("auto.duplicate")}>
                <CopySimple size={13} />
              </button>
              <button type="button" onClick={() => moveRule(-1)} disabled={selectedIndex === 0} className="btn-press flex h-8 items-center justify-center rounded-lg border border-repressurizer-border-subtle text-repressurizer-text-faint hover:text-repressurizer-text disabled:opacity-30" title={t("auto.moveUp")}>
                <ArrowUp size={13} />
              </button>
              <button type="button" onClick={() => moveRule(1)} disabled={selectedIndex === rules.length - 1} className="btn-press flex h-8 items-center justify-center rounded-lg border border-repressurizer-border-subtle text-repressurizer-text-faint hover:text-repressurizer-text disabled:opacity-30" title={t("auto.moveDown")}>
                <ArrowDown size={13} />
              </button>
            </div>
          </div>
          {selectedRule && (
            <div className="space-y-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface p-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{t("auto.name")}</label>
                <input
                  value={selectedRule.name}
                  onChange={(e) => updateRule(selectedIndex, { name: e.target.value })}
                  className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label={t("auto.minScore")} value={selectedRule.min_score} min={0} max={100} onChange={(value) => updateRule(selectedIndex, { min_score: value })} />
                <NumberField label={t("auto.maxScore")} value={selectedRule.max_score} min={0} max={100} onChange={(value) => updateRule(selectedIndex, { max_score: value })} />
                <NumberField label={t("auto.minReviews")} value={selectedRule.min_reviews} min={0} onChange={(value) => updateRule(selectedIndex, { min_reviews: value })} />
                <NumberField label={t("auto.maxReviews")} value={selectedRule.max_reviews} min={0} onChange={(value) => updateRule(selectedIndex, { max_reviews: value })} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-repressurizer-text-faint">{t("auto.maxReviewsHint")}</p>
                <button
                  type="button"
                  onClick={removeRule}
                  disabled={rules.length <= 1}
                  className="btn-press inline-flex items-center gap-1 rounded-lg border border-repressurizer-danger/30 px-2 py-1 text-[11px] text-repressurizer-danger/70 hover:text-repressurizer-danger disabled:opacity-30"
                >
                  <Trash size={12} />
                  {t("auto.delete")}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-3 text-repressurizer-text-faint">{t("auto.ratingRulesOrderHint")}</p>
        <p className="mt-1 text-repressurizer-text-faint">{t("auto.steamRatingSkipped")}</p>
        {duplicateNames.size > 0 && (
          <p className="mt-2 text-xs text-amber-400">{t("auto.duplicateRuleNames")}</p>
        )}
      </div>
    </div>
  );
}
