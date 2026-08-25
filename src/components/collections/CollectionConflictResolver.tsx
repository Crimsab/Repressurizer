import { useEffect, useMemo, useState } from "react";
import { ArrowsMerge, Check, X } from "@phosphor-icons/react";
import {
  resolveThreeWayCollectionMerge,
  type CollectionConflict,
  type ConflictResolution,
  type ConflictResolutionChoice,
  type ThreeWayMergeAnalysis,
} from "../../lib/collectionConflictResolver";
import { diffCollectionSnapshots } from "../../lib/collectionTimeMachine";
import { useT, type TranslationKey } from "../../lib/i18n";
import { useConflictResolverStore } from "../../stores/conflictResolverStore";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";

type ResolverPhase = "conflicts" | "preview";

function branchSummary(value: unknown): string {
  if (value == null) return "∅";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  const record = value as Record<string, unknown>;
  if (typeof record.name === "string") return `${record.name}${Array.isArray(record.added) ? ` · ${record.added.length} games` : ""}`;
  return JSON.stringify(value).slice(0, 140);
}

export function CollectionConflictResolver({ analysis, onCancel, onConfirm }: { analysis: ThreeWayMergeAnalysis; onCancel: () => void; onConfirm: (collections: ThreeWayMergeAnalysis["autoMerged"]) => Promise<void> }) {
  const t = useT();
  const preferences = useConflictResolverStore();
  const [phase, setPhase] = useState<ResolverPhase>("conflicts");
  const [choices, setChoices] = useState<Record<string, ConflictResolutionChoice>>({});
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!preferences.hydrated) void preferences.hydrate(); }, [preferences]);
  useEffect(() => {
    const policyChoices = Object.fromEntries(analysis.conflicts.flatMap((conflict) => {
      const policy = preferences.kindPolicies[conflict.kind] ?? (preferences.defaultPolicy === "ask" ? null : preferences.defaultPolicy);
      return policy ? [[conflict.id, policy]] : [];
    })) as Record<string, ConflictResolutionChoice>;
    setChoices((current) => ({ ...policyChoices, ...current }));
  }, [analysis, preferences.defaultPolicy, preferences.kindPolicies]);

  const parsed = useMemo(() => {
    const resolutions: Record<string, ConflictResolution> = {};
    const manualErrors = new Set<string>();
    for (const conflict of analysis.conflicts) {
      const choice = choices[conflict.id];
      if (!choice) continue;
      if (choice !== "manual") { resolutions[conflict.id] = { choice }; continue; }
      try { resolutions[conflict.id] = { choice, manualValue: JSON.parse(manualValues[conflict.id] ?? "") }; }
      catch { manualErrors.add(conflict.id); }
    }
    return { resolutions, manualErrors };
  }, [analysis.conflicts, choices, manualValues]);
  const unresolved = analysis.conflicts.filter((conflict) => !parsed.resolutions[conflict.id]).length;
  const resolvedCollections = unresolved === 0 ? resolveThreeWayCollectionMerge(analysis, parsed.resolutions) : analysis.autoMerged;
  const finalDiff = diffCollectionSnapshots(analysis.steam, resolvedCollections);

  const setAll = (choice: "steam" | "repressurizer") => setChoices(Object.fromEntries(analysis.conflicts.map((conflict) => [conflict.id, choice])));
  const chooseSimilar = (source: CollectionConflict) => {
    const choice = choices[source.id];
    if (!choice) return;
    setChoices((current) => ({ ...current, ...Object.fromEntries(analysis.conflicts.filter((conflict) => conflict.kind === source.kind).map((conflict) => [conflict.id, choice])) }));
    if (choice === "steam" || choice === "repressurizer") preferences.setKindPolicy(source.kind, choice);
  };

  const confirm = async () => {
    setSaving(true);
    try {
      const mergeId = `merge-${Date.now().toString(36)}`;
      preferences.recordDecisions(mergeId, analysis.conflicts.map((conflict) => ({ identity: conflict.identity, kind: conflict.kind, choice: parsed.resolutions[conflict.id].choice })));
      await onConfirm(resolvedCollections);
    } finally { setSaving(false); }
  };

  return <DialogOverlay label={t("conflicts.title")} onClose={onCancel} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-3 backdrop-blur-md sm:p-4">
    <ResizableDialogPanel dialogId="collection-conflict-resolver" defaultSize={{ width: 1040, height: 780 }} minSize={{ width: 660, height: 500 }} className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog">
      {({ sizeControls }) => <>
        <header className="flex items-start justify-between border-b border-repressurizer-border px-4 py-3 sm:px-5">
          <div className="flex gap-2.5"><ArrowsMerge size={20} weight="duotone" className="mt-0.5 text-repressurizer-accent" /><div><h2 className="text-base font-semibold text-white">{t("conflicts.title")}</h2><p className="text-xs text-repressurizer-text-faint">{t("conflicts.description")}</p></div></div>
          <div className="flex items-center gap-1">{sizeControls}<button aria-label={t("common.close")} onClick={onCancel} className="rounded-lg p-1.5 text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"><X size={16} /></button></div>
        </header>
        <nav className="flex border-b border-repressurizer-border-subtle px-4"><button onClick={() => setPhase("conflicts")} className={`border-b-2 px-3 py-2.5 text-xs ${phase === "conflicts" ? "border-repressurizer-accent text-repressurizer-accent" : "border-transparent text-repressurizer-text-muted"}`}>{t("conflicts.tab.resolve")} ({analysis.conflicts.length})</button><button onClick={() => unresolved === 0 && setPhase("preview")} disabled={unresolved > 0} className={`border-b-2 px-3 py-2.5 text-xs disabled:opacity-40 ${phase === "preview" ? "border-repressurizer-accent text-repressurizer-accent" : "border-transparent text-repressurizer-text-muted"}`}>{t("conflicts.tab.preview")}</button></nav>
        {phase === "conflicts" ? <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/45 p-3">
            <span className="mr-auto text-xs text-repressurizer-text-muted">{analysis.conflicts.length ? t("conflicts.unresolved", { count: unresolved }) : t("conflicts.autoMerged")}</span>
            <label className="flex items-center gap-2 text-[10px] text-repressurizer-text-faint">{t("conflicts.defaultPolicy")}<select value={preferences.defaultPolicy} onChange={(event) => preferences.setDefaultPolicy(event.target.value as "ask" | "steam" | "repressurizer")} className="rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2 py-1.5 text-xs text-repressurizer-text"><option value="ask">{t("conflicts.ask")}</option><option value="steam">{t("conflicts.keepSteam")}</option><option value="repressurizer">{t("conflicts.keepLocal")}</option></select></label>
            {analysis.conflicts.length > 0 && <><button onClick={() => setAll("steam")} className="rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted">{t("conflicts.allSteam")}</button><button onClick={() => setAll("repressurizer")} className="rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted">{t("conflicts.allLocal")}</button></>}
          </section>
          {analysis.conflicts.length ? <div className="space-y-3">{analysis.conflicts.map((conflict) => <ConflictCard key={conflict.id} conflict={conflict} choice={choices[conflict.id] ?? ""} manualValue={manualValues[conflict.id] ?? JSON.stringify(conflict.repressurizerValue, null, 2)} manualError={parsed.manualErrors.has(conflict.id)} onChoice={(choice) => { setChoices((current) => ({ ...current, [conflict.id]: choice })); if (choice === "manual" && manualValues[conflict.id] == null) setManualValues((current) => ({ ...current, [conflict.id]: JSON.stringify(conflict.repressurizerValue, null, 2) })); }} onManual={(value) => setManualValues((current) => ({ ...current, [conflict.id]: value }))} onSimilar={() => chooseSimilar(conflict)} />)}</div> : <div className="py-16 text-center"><Check size={28} className="mx-auto text-repressurizer-accent" /><p className="mt-2 text-sm text-white">{t("conflicts.noCollisions")}</p><p className="mt-1 text-xs text-repressurizer-text-faint">{t("conflicts.noCollisions.desc")}</p></div>}
        </div> : <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <p className="text-sm text-repressurizer-text-muted">{t("conflicts.preview.description")}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6"><Metric label={t("timeMachine.created")} value={finalDiff.created} /><Metric label={t("timeMachine.deleted")} value={finalDiff.deleted} /><Metric label={t("timeMachine.renamed")} value={finalDiff.renamed} /><Metric label={t("timeMachine.colors")} value={finalDiff.colors} /><Metric label={t("timeMachine.gamesAdded")} value={finalDiff.gamesAdded} /><Metric label={t("timeMachine.gamesRemoved")} value={finalDiff.gamesRemoved} /></div>
          <div className="mt-4 space-y-2">{finalDiff.changes.map((change) => <div key={change.identity} className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/45 p-3"><p className="text-xs font-medium text-white">{change.after?.name ?? change.before?.name}</p><p className="mt-1 text-[10px] text-repressurizer-text-muted">+{change.addedGameIds.length} / −{change.removedGameIds.length}{change.renamed ? ` · ${change.before?.name} → ${change.after?.name}` : ""}</p></div>)}</div>
        </div>}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-repressurizer-border px-4 py-3"><div><p className="text-[10px] text-repressurizer-text-faint">{t("conflicts.recent", { count: preferences.recentDecisions.length })}</p><p className="text-[9px] text-repressurizer-text-faint">{t("conflicts.undoHint")}</p></div><div className="flex gap-2"><button onClick={onCancel} disabled={saving} className="rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted">{t("conflicts.cancelAll")}</button>{phase === "conflicts" ? <button onClick={() => setPhase("preview")} disabled={unresolved > 0} className="rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-40">{t("conflicts.previewResult")}</button> : <button onClick={() => void confirm()} disabled={saving} className="rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-40">{saving ? t("conflicts.saving") : t("conflicts.confirmWrite")}</button>}</div></footer>
      </>}
    </ResizableDialogPanel>
  </DialogOverlay>;
}

function ConflictCard({ conflict, choice, manualValue, manualError, onChoice, onManual, onSimilar }: { conflict: CollectionConflict; choice: ConflictResolutionChoice | ""; manualValue: string; manualError: boolean; onChoice: (choice: ConflictResolutionChoice) => void; onManual: (value: string) => void; onSimilar: () => void }) {
  const t = useT();
  return <article data-testid={`collection-conflict-${conflict.id}`} className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className="rounded-full bg-amber-400/10 px-2 py-1 text-[9px] font-semibold uppercase text-amber-300">{t(`conflicts.kind.${conflict.kind}` as TranslationKey)}</span><p className="mt-2 text-xs text-white">{conflict.explanation}</p></div><div className="flex gap-1"><select aria-label={t("conflicts.choice")} value={choice} onChange={(event) => onChoice(event.target.value as ConflictResolutionChoice)} className="rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2 py-1.5 text-xs text-repressurizer-text"><option value="" disabled>{t("conflicts.choose")}</option><option value="steam">{t("conflicts.keepSteam")}</option><option value="repressurizer">{t("conflicts.keepLocal")}</option><option value="merge">{t("conflicts.mergeBoth")}</option><option value="manual">{t("conflicts.manual")}</option></select><button onClick={onSimilar} disabled={!choice} className="rounded-lg border border-repressurizer-border px-2 py-1.5 text-[10px] text-repressurizer-text-muted disabled:opacity-40">{t("conflicts.applySimilar")}</button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><Branch label={t("conflicts.base")} value={conflict.baseValue} /><Branch label={t("conflicts.steam")} value={conflict.steamValue} /><Branch label={t("conflicts.local")} value={conflict.repressurizerValue} /></div>{choice === "manual" && <label className="mt-3 block space-y-1"><span className="text-[9px] uppercase text-repressurizer-text-faint">{t("conflicts.manualJson")}</span><textarea value={manualValue} onChange={(event) => onManual(event.target.value)} rows={3} className={`w-full rounded-lg border bg-repressurizer-surface p-2 font-mono text-[10px] text-repressurizer-text ${manualError ? "border-repressurizer-danger" : "border-repressurizer-border"}`} />{manualError && <span className="text-[10px] text-repressurizer-danger">{t("conflicts.invalidJson")}</span>}</label>}</article>;
}
function Branch({ label, value }: { label: string; value: unknown }) { return <div className="min-w-0 rounded-lg border border-repressurizer-border-subtle p-2"><p className="text-[9px] font-semibold uppercase text-repressurizer-text-faint">{label}</p><p className="mt-1 break-words text-[10px] text-repressurizer-text-muted">{branchSummary(value)}</p></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/55 p-2 text-center"><p className="font-mono text-sm text-white">{value}</p><p className="text-[9px] text-repressurizer-text-faint">{label}</p></div>; }
