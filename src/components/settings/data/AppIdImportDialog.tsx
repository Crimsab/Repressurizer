import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  FileText,
  LinkSimple,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import {
  appIdImportChecksum,
  createAppIdImportPlan,
  LARGE_APP_ID_IMPORT_THRESHOLD,
  parseAppIdImportText,
  shouldAutoUpdateLinkedImport,
  uniqueSortedIds,
  undoAppIdImportBatch,
  type AppIdImportBatch,
  type AppIdImportMetadataPolicy,
  type AppIdImportOperation,
  type AppIdImportScope,
} from "../../../lib/appIdImport";
import { useT } from "../../../lib/i18n";
import type { OwnedGame, SteamCollection } from "../../../lib/types";
import { useAppIdImportStore } from "../../../stores/appIdImportStore";
import { useBackgroundFetchStore } from "../../../stores/backgroundFetchStore";
import { useCategoryStore } from "../../../stores/categoryStore";
import { useGameStore } from "../../../stores/gameStore";
import { useSteamAppIndexStore } from "../../../stores/steamAppIndexStore";
import { DialogOverlay } from "../../ui/DialogOverlay";
import { SelectMenu } from "../../ui/SelectMenu";

type ImportMode = "new" | "existing";
type WorkflowStep = 0 | 1 | 2 | 3;

const STEPS = ["source", "scope", "destination", "review"] as const;

export function AppIdImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const t = useT();
  const games = useGameStore((state) => state.games);
  const collections = useCategoryStore((state) => state.collections);
  const batches = useAppIdImportStore((state) => state.batches);
  const hydrated = useAppIdImportStore((state) => state.hydrated);
  const [step, setStep] = useState<WorkflowStep>(0);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("new");
  const [collectionName, setCollectionName] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [text, setText] = useState("");
  const [scope, setScope] = useState<AppIdImportScope>("reference");
  const [operation, setOperation] = useState<AppIdImportOperation>("append");
  const [metadataPolicy, setMetadataPolicy] = useState<AppIdImportMetadataPolicy>("none");
  const [backgroundLimit, setBackgroundLimit] = useState(50);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [largeImportConfirmed, setLargeImportConfirmed] = useState(false);
  const [localImportConfirmed, setLocalImportConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated) void useAppIdImportStore.getState().hydrate();
  }, [hydrated]);

  const targets = useMemo(
    () => collections.filter((collection) =>
      !collection.is_dynamic &&
      !collection.is_deleted &&
      collection.key !== "user-collections.hidden" &&
      collection.key !== "user-collections.favorite"
    ),
    [collections],
  );
  const parsed = useMemo(() => parseAppIdImportText(text), [text]);
  const sourceHash = useMemo(() => appIdImportChecksum(parsed.appIds), [parsed.appIds]);
  const ownedIds = useMemo(
    () => Object.values(games).filter((game) => !game.is_collection_only).map((game) => game.appid),
    [games],
  );
  const selectedTarget = targets.find((collection) => collection.key === targetKey);
  const editingBatch = batches.find((batch) => batch.id === editingBatchId) ?? null;
  const effectiveOperation = mode === "new" ? "append" : operation;
  const destructiveLinkedOperation = scope === "reference" &&
    (effectiveOperation === "replace" || effectiveOperation === "intersect");
  const effectiveAutoUpdate = shouldAutoUpdateLinkedImport(scope, effectiveOperation, autoUpdate);
  const baselineTargetIds = useMemo(() => {
    const current = selectedTarget?.added ?? [];
    if (!editingBatch?.active || editingBatch.targetKey !== selectedTarget?.key) return current;
    return undoAppIdImportBatch(current, editingBatch);
  }, [editingBatch, selectedTarget]);
  const plan = useMemo(() => createAppIdImportPlan({
    sourceIds: parsed.appIds,
    ownedIds,
    targetIds: mode === "new" ? [] : baselineTargetIds,
    scope,
    operation: effectiveOperation,
  }), [baselineTargetIds, effectiveOperation, mode, ownedIds, parsed.appIds, scope]);
  const duplicateName = mode === "new" && collections.some((collection) =>
    !collection.is_deleted && collection.name.trim().toLocaleLowerCase() === collectionName.trim().toLocaleLowerCase()
  );
  const duplicateBatch = batches.find((batch) =>
    batch.active &&
    batch.id !== editingBatchId &&
    batch.sourceHash === sourceHash &&
    batch.targetKey === targetKey &&
    batch.operation === effectiveOperation
  );
  const requiresLargeConfirmation = parsed.appIds.length >= LARGE_APP_ID_IMPORT_THRESHOLD;
  const requiresLocalConfirmation = scope === "local" && plan.outsideLibraryCount > 0;
  const hasChanges = plan.addedIds.length > 0 || plan.removedIds.length > 0;
  const sourceReady = parsed.appIds.length > 0;
  const destinationReady = mode === "new"
    ? !!collectionName.trim() && !duplicateName
    : !!selectedTarget;
  const canApply = sourceReady && destinationReady && hasChanges && !duplicateBatch &&
    (!requiresLargeConfirmation || largeImportConfirmed) &&
    (!requiresLocalConfirmation || localImportConfirmed);

  const chooseFile = async () => {
    setError("");
    try {
      const path = await open({
        multiple: false,
        filters: [
          { name: "App ID list", extensions: ["txt", "csv", "list"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (!path || Array.isArray(path)) return;
      const content = await readTextFile(path);
      setSourcePath(path);
      setText(content);
      setLargeImportConfirmed(false);
      setLocalImportConfirmed(false);
    } catch (reason) {
      setError(t("settings.appIdImport.readFailed", { error: String(reason) }));
    }
  };

  const loadBatch = (batch: AppIdImportBatch) => {
    setEditingBatchId(batch.id);
    setText(batch.appIds.join("\n"));
    setSourcePath(batch.sourceName);
    setScope(batch.scope);
    setOperation(batch.operation);
    setMetadataPolicy(batch.metadataPolicy);
    setBackgroundLimit(batch.backgroundLimit);
    setAutoUpdate(batch.autoUpdate);
    setMode("existing");
    setTargetKey(batch.targetKey);
    setCollectionName(batch.targetName);
    setLargeImportConfirmed(false);
    setLocalImportConfirmed(false);
    setStep(1);
  };

  const undoBatch = (batch: AppIdImportBatch) => {
    const target = collections.find((collection) => collection.key === batch.targetKey);
    if (!target) {
      useAppIdImportStore.getState().deactivate(batch.id);
      return;
    }
    const restored = undoAppIdImportBatch(target.added, batch);
    const next = collections.map((collection) => collection.key === batch.targetKey
      ? { ...collection, added: restored, timestamp: Math.floor(Date.now() / 1000) }
      : collection);
    useCategoryStore.getState().applyImportedCollections(next, "import");
    useAppIdImportStore.getState().deactivate(batch.id);
    cleanupUnusedLocalGames(batch.afterIds, next);
    onImported(t("settings.appIdImport.undoSuccess", { name: batch.name }));
  };

  const exportRejected = async () => {
    const rows = [
      ...parsed.invalidEntries.map((entry) => `invalid\t${entry}`),
      ...(parsed.truncatedCount > 0 ? [`truncated\t${parsed.truncatedCount}`] : []),
    ];
    if (rows.length === 0) return;
    const path = await save({
      defaultPath: "repressurizer-appid-import-rejected.txt",
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (path) await writeTextFile(path, rows.join("\n"));
  };

  const applyImport = () => {
    if (!canApply) return;
    const now = Date.now();
    const targetName = mode === "new" ? collectionName.trim() : selectedTarget!.name;
    const resolvedTargetKey = mode === "new"
      ? `user-collections.uc-import-${now.toString(36)}`
      : selectedTarget!.key;
    let nextCollections = collections;

    if (editingBatch?.active) {
      nextCollections = restoreBatchInCollections(nextCollections, editingBatch);
    }

    const targetIndex = nextCollections.findIndex((collection) => collection.key === resolvedTargetKey);
    const targetBefore = targetIndex >= 0 ? nextCollections[targetIndex].added : [];
    const finalPlan = createAppIdImportPlan({
      sourceIds: parsed.appIds,
      ownedIds,
      targetIds: targetBefore,
      scope,
      operation: effectiveOperation,
    });

    if (targetIndex >= 0) {
      nextCollections = nextCollections.map((collection, index) => index === targetIndex
        ? { ...collection, added: finalPlan.resultIds, timestamp: Math.floor(now / 1000) }
        : collection);
    } else {
      nextCollections = [...nextCollections, createCollection(resolvedTargetKey, targetName, finalPlan.resultIds, now)];
    }

    if (scope === "local") {
      const currentGames = useGameStore.getState().games;
      const placeholders = finalPlan.addedIds
        .filter((appId) => !currentGames[appId])
        .map((appId) => placeholderGame(appId, metadataPolicy));
      if (placeholders.length > 0) useGameStore.getState().mergeGames(placeholders);
    }

    useCategoryStore.getState().applyImportedCollections(nextCollections, "import");
    useCategoryStore.getState().setActiveCategory(resolvedTargetKey);
    cleanupUnusedLocalGames(editingBatch?.afterIds ?? [], nextCollections);

    const batchId = editingBatch?.id ?? `appid-import-${now.toString(36)}`;
    const batch: AppIdImportBatch = {
      id: batchId,
      name: sourceLabel(sourcePath, targetName),
      sourceName: sourcePath || t("settings.appIdImport.pastedSource"),
      sourceHash,
      appIds: uniqueSortedIds(parsed.appIds),
      targetKey: resolvedTargetKey,
      targetName,
      scope,
      operation: effectiveOperation,
      metadataPolicy,
      backgroundLimit,
      autoUpdate: effectiveAutoUpdate,
      beforeIds: targetBefore,
      afterIds: finalPlan.resultIds,
      createdAt: editingBatch?.createdAt ?? now,
      updatedAt: now,
      active: true,
    };
    useAppIdImportStore.getState().upsert(batch);

    if (metadataPolicy === "background") {
      useBackgroundFetchStore.getState().startDetailsFetch(
        finalPlan.addedIds.slice(0, Math.max(1, Math.min(500, backgroundLimit))),
      );
    }

    onImported(t("settings.appIdImport.successDetailed", {
      added: finalPlan.addedIds.length,
      removed: finalPlan.removedIds.length,
      collection: targetName,
      references: finalPlan.referenceIds.length,
    }));
    onClose();
  };

  const nextStep = () => {
    if (step === 0 && !sourceReady) return;
    if (step === 2 && !destinationReady) return;
    setStep(Math.min(3, step + 1) as WorkflowStep);
  };

  return (
    <DialogOverlay
      label={t("settings.appIdImport.title")}
      onClose={onClose}
      className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/60 p-3 backdrop-blur-sm sm:p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[min(820px,calc(100vh-40px))] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog">
        <header className="flex items-start justify-between gap-4 border-b border-repressurizer-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-repressurizer-text">{t("settings.appIdImport.title")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">{t("settings.appIdImport.smartDesc")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white">
            <X size={16} weight="bold" />
          </button>
        </header>

        <nav aria-label={t("settings.appIdImport.progress")} className="grid grid-cols-4 border-b border-repressurizer-border bg-repressurizer-bg/40 px-3 sm:px-5">
          {STEPS.map((key, index) => (
            <button
              key={key}
              type="button"
              onClick={() => { if (index <= step) setStep(index as WorkflowStep); }}
              className={`relative min-w-0 px-1 py-3 text-center text-[10px] font-medium uppercase tracking-wider transition-colors sm:text-xs ${index === step ? "text-repressurizer-accent" : index < step ? "text-repressurizer-text" : "text-repressurizer-text-faint"}`}
            >
              <span className="hidden sm:inline">{index + 1}. </span>{t(`settings.appIdImport.step.${key}`)}
              {index === step && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-repressurizer-accent" />}
            </button>
          ))}
        </nav>

        <div data-testid="appid-import-body" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5">
          {step === 0 && (
            <SourceStep
              text={text}
              sourcePath={sourcePath}
              parsed={parsed}
              batches={batches}
              editingBatchId={editingBatchId}
              onTextChange={(value) => { setText(value); setSourcePath(""); }}
              onChooseFile={() => void chooseFile()}
              onLoadBatch={loadBatch}
              onUndoBatch={undoBatch}
              onDeleteBatch={(id) => useAppIdImportStore.getState().remove(id)}
            />
          )}

          {step === 1 && (
            <ScopeStep
              scope={scope}
              metadataPolicy={metadataPolicy}
              backgroundLimit={backgroundLimit}
              autoUpdate={autoUpdate}
              outsideLibraryCount={plan.outsideLibraryCount}
              onScopeChange={(value) => { setScope(value); setLocalImportConfirmed(false); }}
              onMetadataChange={setMetadataPolicy}
              onBackgroundLimitChange={setBackgroundLimit}
              onAutoUpdateChange={setAutoUpdate}
            />
          )}

          {step === 2 && (
            <DestinationStep
              mode={mode}
              collectionName={collectionName}
              targetKey={targetKey}
              targets={targets}
              operation={effectiveOperation}
              duplicateName={duplicateName}
              locked={!!editingBatch}
              onModeChange={(value) => {
                setMode(value);
                if (value === "existing" && !targetKey) setTargetKey(targets[0]?.key ?? "");
              }}
              onCollectionNameChange={setCollectionName}
              onTargetChange={setTargetKey}
              onOperationChange={(value) => {
                setOperation(value);
                if (value === "replace" || value === "intersect") setAutoUpdate(false);
              }}
            />
          )}

          {step === 3 && (
            <ReviewStep
              parsed={parsed}
              plan={plan}
              scope={scope}
              operation={effectiveOperation}
              metadataPolicy={metadataPolicy}
              autoUpdate={effectiveAutoUpdate}
              destructiveLinkedOperation={destructiveLinkedOperation}
              duplicateBatch={duplicateBatch}
              requiresLargeConfirmation={requiresLargeConfirmation}
              largeImportConfirmed={largeImportConfirmed}
              requiresLocalConfirmation={requiresLocalConfirmation}
              localImportConfirmed={localImportConfirmed}
              onLargeConfirmationChange={setLargeImportConfirmed}
              onLocalConfirmationChange={setLocalImportConfirmed}
              onExportRejected={() => void exportRejected()}
            />
          )}

          {error && <div className="mt-4 flex items-start gap-2 rounded-lg border border-repressurizer-danger/25 bg-repressurizer-danger/8 px-3 py-2 text-xs text-repressurizer-danger"><Warning size={15} className="mt-0.5 shrink-0" />{error}</div>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-repressurizer-border px-5 py-3">
          <p className="max-w-md text-[11px] text-repressurizer-text-faint">{t("settings.appIdImport.staged")}</p>
          <div className="ml-auto flex gap-2">
            {step > 0 ? (
              <button type="button" onClick={() => setStep((step - 1) as WorkflowStep)} className="btn-press inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white">
                <ArrowLeft size={14} />{t("common.back")}
              </button>
            ) : (
              <button type="button" onClick={onClose} className="btn-press rounded-lg px-3 py-2 text-sm text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white">{t("common.cancel")}</button>
            )}
            {step < 3 ? (
              <button type="button" onClick={nextStep} disabled={(step === 0 && !sourceReady) || (step === 2 && !destinationReady)} className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-accent px-4 py-2 text-sm font-medium text-white hover:bg-repressurizer-accent-hover disabled:cursor-not-allowed disabled:opacity-40">
                {t("common.continue")}<ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" onClick={applyImport} disabled={!canApply} className="btn-press rounded-lg bg-repressurizer-accent px-4 py-2 text-sm font-medium text-white hover:bg-repressurizer-accent-hover disabled:cursor-not-allowed disabled:opacity-40">
                {t(editingBatch ? "settings.appIdImport.update" : "settings.appIdImport.apply")}
              </button>
            )}
          </div>
        </footer>
      </div>
    </DialogOverlay>
  );
}

function SourceStep({ text, sourcePath, parsed, batches, editingBatchId, onTextChange, onChooseFile, onLoadBatch, onUndoBatch, onDeleteBatch }: {
  text: string;
  sourcePath: string;
  parsed: ReturnType<typeof parseAppIdImportText>;
  batches: AppIdImportBatch[];
  editingBatchId: string | null;
  onTextChange: (value: string) => void;
  onChooseFile: () => void;
  onLoadBatch: (batch: AppIdImportBatch) => void;
  onUndoBatch: (batch: AppIdImportBatch) => void;
  onDeleteBatch: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="min-w-0">
        <h4 className="text-sm font-semibold text-repressurizer-text">{t("settings.appIdImport.source")}</h4>
        <p className="mt-1 text-xs text-repressurizer-text-faint">{t("settings.appIdImport.source.desc")}</p>
        <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2">
            <p className="truncate font-mono text-xs text-repressurizer-text-muted">{sourcePath || t("settings.appIdImport.noFile")}</p>
          </div>
          <button type="button" onClick={onChooseFile} className="btn-press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-repressurizer-border px-3 py-2 text-xs font-medium text-repressurizer-text hover:border-repressurizer-accent/50 hover:text-repressurizer-accent">
            <FileText size={14} />{t("settings.appIdImport.choose")}
          </button>
        </div>
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={t("settings.appIdImport.placeholder")}
          data-testid="appid-import-text"
          className="mt-2 h-56 w-full resize-y rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 font-mono text-xs leading-relaxed text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-repressurizer-text-faint">
          <span>{t("settings.appIdImport.validCount", { count: parsed.appIds.length })}</span>
          <span>{t("settings.appIdImport.duplicateCount", { count: parsed.duplicateCount })}</span>
          <span className={parsed.invalidEntries.length ? "text-amber-300" : ""}>{t("settings.appIdImport.invalidCount", { count: parsed.invalidEntries.length })}</span>
        </div>
      </section>

      <section className="min-w-0 border-t border-repressurizer-border-subtle pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <h4 className="text-sm font-semibold text-repressurizer-text">{t("settings.appIdImport.saved")}</h4>
        <p className="mt-1 text-xs text-repressurizer-text-faint">{t("settings.appIdImport.saved.desc")}</p>
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {batches.length === 0 && <p className="rounded-lg border border-dashed border-repressurizer-border px-3 py-6 text-center text-xs text-repressurizer-text-faint">{t("settings.appIdImport.saved.empty")}</p>}
          {batches.map((batch) => (
            <div key={batch.id} className={`rounded-lg border px-3 py-2.5 ${editingBatchId === batch.id ? "border-repressurizer-accent bg-repressurizer-accent/5" : "border-repressurizer-border-subtle bg-repressurizer-bg"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-repressurizer-text">{batch.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-repressurizer-text-faint">{batch.targetName} · {batch.appIds.length.toLocaleString()} ID</p>
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${batch.active ? "bg-repressurizer-accent/10 text-repressurizer-accent" : "bg-repressurizer-surface-hover text-repressurizer-text-faint"}`}>
                  {t(batch.active ? "settings.appIdImport.active" : "settings.appIdImport.undone")}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button type="button" onClick={() => onLoadBatch(batch)} className="btn-press rounded-md border border-repressurizer-border px-2 py-1 text-[10px] text-repressurizer-text-muted hover:text-repressurizer-accent">{t("settings.appIdImport.load")}</button>
                {batch.active ? (
                  <button type="button" onClick={() => onUndoBatch(batch)} className="btn-press inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/10"><ClockCounterClockwise size={11} />{t("common.undo")}</button>
                ) : (
                  <button type="button" onClick={() => onDeleteBatch(batch.id)} className="btn-press inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-repressurizer-danger hover:bg-repressurizer-danger/10"><Trash size={11} />{t("common.delete")}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScopeStep({ scope, metadataPolicy, backgroundLimit, autoUpdate, outsideLibraryCount, onScopeChange, onMetadataChange, onBackgroundLimitChange, onAutoUpdateChange }: {
  scope: AppIdImportScope;
  metadataPolicy: AppIdImportMetadataPolicy;
  backgroundLimit: number;
  autoUpdate: boolean;
  outsideLibraryCount: number;
  onScopeChange: (value: AppIdImportScope) => void;
  onMetadataChange: (value: AppIdImportMetadataPolicy) => void;
  onBackgroundLimitChange: (value: number) => void;
  onAutoUpdateChange: (value: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl">
      <h4 className="text-sm font-semibold text-repressurizer-text">{t("settings.appIdImport.scope.title")}</h4>
      <p className="mt-1 text-xs text-repressurizer-text-faint">{t("settings.appIdImport.scope.desc", { count: outsideLibraryCount })}</p>
      <div className="mt-4 grid gap-2">
        {(["reference", "owned", "local"] as AppIdImportScope[]).map((value) => (
          <ChoiceRow
            key={value}
            selected={scope === value}
            title={t(`settings.appIdImport.scope.${value}`)}
            description={t(`settings.appIdImport.scope.${value}.desc`)}
            badge={value === "reference" ? t("common.recommended") : undefined}
            onClick={() => onScopeChange(value)}
          />
        ))}
      </div>

      {scope === "reference" && (
        <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2.5">
          <input type="checkbox" checked={autoUpdate} onChange={(event) => onAutoUpdateChange(event.target.checked)} className="mt-0.5 accent-repressurizer-accent" />
          <span><span className="block text-xs font-medium text-repressurizer-text">{t("settings.appIdImport.autoUpdate")}</span><span className="mt-0.5 block text-[11px] text-repressurizer-text-faint">{t("settings.appIdImport.autoUpdate.desc")}</span></span>
        </label>
      )}

      <div className="mt-6 border-t border-repressurizer-border-subtle pt-5">
        <h4 className="text-sm font-semibold text-repressurizer-text">{t("settings.appIdImport.metadata.title")}</h4>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(["none", "cached", "on-demand", "background"] as AppIdImportMetadataPolicy[]).map((value) => (
            <ChoiceRow key={value} compact selected={metadataPolicy === value} title={t(`settings.appIdImport.metadata.${value}`)} description={t(`settings.appIdImport.metadata.${value}.desc`)} onClick={() => onMetadataChange(value)} />
          ))}
        </div>
        {metadataPolicy === "background" && (
          <label className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
            <span className="text-xs text-repressurizer-text">{t("settings.appIdImport.backgroundLimit")}</span>
            <input type="number" min={1} max={500} value={backgroundLimit} onChange={(event) => onBackgroundLimitChange(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} className="h-8 w-24 rounded-md border border-repressurizer-border bg-repressurizer-bg px-2 text-right text-xs text-repressurizer-text focus:border-repressurizer-accent focus:outline-none" />
          </label>
        )}
      </div>
    </div>
  );
}

function DestinationStep({ mode, collectionName, targetKey, targets, operation, duplicateName, locked, onModeChange, onCollectionNameChange, onTargetChange, onOperationChange }: {
  mode: ImportMode;
  collectionName: string;
  targetKey: string;
  targets: SteamCollection[];
  operation: AppIdImportOperation;
  duplicateName: boolean;
  locked: boolean;
  onModeChange: (value: ImportMode) => void;
  onCollectionNameChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  onOperationChange: (value: AppIdImportOperation) => void;
}) {
  const t = useT();
  return (
    <div className="mx-auto max-w-2xl">
      <h4 className="text-sm font-semibold text-repressurizer-text">{t("settings.appIdImport.destination.title")}</h4>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["new", "existing"] as ImportMode[]).map((value) => (
          <button key={value} type="button" disabled={locked || (value === "existing" && targets.length === 0)} onClick={() => onModeChange(value)} className={`btn-press rounded-lg border px-3 py-2.5 text-xs font-medium disabled:opacity-40 ${mode === value ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent" : "border-repressurizer-border text-repressurizer-text-muted"}`}>
            {t(value === "new" ? "settings.appIdImport.new" : "settings.appIdImport.existing")}
          </button>
        ))}
      </div>
      {locked && <p className="mt-2 text-[11px] text-repressurizer-text-faint">{t("settings.appIdImport.lockedDestination")}</p>}

      {mode === "new" ? (
        <div className="mt-5">
          <label htmlFor="appid-import-collection-name" className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint">{t("settings.appIdImport.collectionName")}</label>
          <input id="appid-import-collection-name" value={collectionName} onChange={(event) => onCollectionNameChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none" />
          {duplicateName && <p className="mt-1 text-[11px] text-repressurizer-danger">{t("settings.appIdImport.duplicateName")}</p>}
        </div>
      ) : (
        <div className="mt-5">
          <SelectMenu value={targetKey} options={targets.map((collection) => ({ value: collection.key, label: `${collection.name} (${collection.added.length.toLocaleString()})` }))} onChange={onTargetChange} placeholder={t("settings.appIdImport.selectCollection")} ariaLabel={t("settings.appIdImport.selectCollection")} className="w-full" testId="appid-import-target" disabled={locked} />
        </div>
      )}

      {mode === "existing" && (
        <div className="mt-6 border-t border-repressurizer-border-subtle pt-5">
          <h4 className="text-sm font-semibold text-repressurizer-text">{t("settings.appIdImport.operation.title")}</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(["append", "replace", "subtract", "intersect"] as AppIdImportOperation[]).map((value) => (
              <ChoiceRow key={value} compact selected={operation === value} title={t(`settings.appIdImport.operation.${value}`)} description={t(`settings.appIdImport.operation.${value}.desc`)} onClick={() => onOperationChange(value)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewStep({ parsed, plan, scope, operation, metadataPolicy, autoUpdate, destructiveLinkedOperation, duplicateBatch, requiresLargeConfirmation, largeImportConfirmed, requiresLocalConfirmation, localImportConfirmed, onLargeConfirmationChange, onLocalConfirmationChange, onExportRejected }: {
  parsed: ReturnType<typeof parseAppIdImportText>;
  plan: ReturnType<typeof createAppIdImportPlan>;
  scope: AppIdImportScope;
  operation: AppIdImportOperation;
  metadataPolicy: AppIdImportMetadataPolicy;
  autoUpdate: boolean;
  destructiveLinkedOperation: boolean;
  duplicateBatch: AppIdImportBatch | undefined;
  requiresLargeConfirmation: boolean;
  largeImportConfirmed: boolean;
  requiresLocalConfirmation: boolean;
  localImportConfirmed: boolean;
  onLargeConfirmationChange: (value: boolean) => void;
  onLocalConfirmationChange: (value: boolean) => void;
  onExportRejected: () => void;
}) {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <SummaryChip icon={<LinkSimple size={12} />} text={t(`settings.appIdImport.scope.${scope}`)} />
        <SummaryChip text={t(`settings.appIdImport.operation.${operation}`)} />
        <SummaryChip text={t(`settings.appIdImport.metadata.${metadataPolicy}`)} />
        {scope === "reference" && <SummaryChip text={t(autoUpdate ? "settings.appIdImport.autoUpdate.on" : "settings.appIdImport.autoUpdate.off")} />}
      </div>
      <h4 className="mt-5 text-sm font-semibold text-repressurizer-text">{t("settings.appIdImport.preview")}</h4>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <PreviewStat testId="appid-import-valid" label={t("settings.appIdImport.valid")} value={parsed.appIds.length} />
        <PreviewStat testId="appid-import-added" label={t("settings.appIdImport.added")} value={plan.addedIds.length} tone="success" />
        <PreviewStat testId="appid-import-removed" label={t("settings.appIdImport.removed")} value={plan.removedIds.length} tone={plan.removedIds.length ? "warning" : "default"} />
        <PreviewStat testId="appid-import-references" label={t("settings.appIdImport.references")} value={plan.referenceIds.length} />
        <PreviewStat testId="appid-import-duplicates" label={t("settings.appIdImport.duplicates")} value={parsed.duplicateCount + plan.alreadyPresentCount} />
        <PreviewStat testId="appid-import-invalid" label={t("settings.appIdImport.invalid")} value={parsed.invalidEntries.length} tone={parsed.invalidEntries.length ? "warning" : "default"} />
        <PreviewStat testId="appid-import-outside-library" label={t("settings.appIdImport.outsideLibrary")} value={plan.outsideLibraryCount} />
        <PreviewStat testId="appid-import-final" label={t("settings.appIdImport.finalSize")} value={plan.resultIds.length} />
      </div>

      {(parsed.invalidEntries.length > 0 || parsed.truncatedCount > 0) && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <p className="min-w-0 break-words font-mono text-[10px] text-amber-300">{parsed.invalidEntries.slice(0, 6).join(", ")}{parsed.invalidEntries.length > 6 ? ` +${parsed.invalidEntries.length - 6}` : ""}</p>
          <button type="button" onClick={onExportRejected} className="btn-press shrink-0 rounded-md border border-amber-500/25 px-2.5 py-1 text-[10px] text-amber-300">{t("settings.appIdImport.exportRejected")}</button>
        </div>
      )}

      {duplicateBatch && <WarningRow tone="danger" text={t("settings.appIdImport.duplicateBatch", { name: duplicateBatch.name })} />}
      {requiresLargeConfirmation && (
        <ConfirmRow checked={largeImportConfirmed} onChange={onLargeConfirmationChange} text={t("settings.appIdImport.confirmLarge", { count: parsed.appIds.length })} />
      )}
      {requiresLocalConfirmation && (
        <ConfirmRow checked={localImportConfirmed} onChange={onLocalConfirmationChange} text={t("settings.appIdImport.confirmLocal", { count: plan.outsideLibraryCount })} warning />
      )}
      {destructiveLinkedOperation && <WarningRow tone="warning" text={t("settings.appIdImport.destructiveAutoUpdateDisabled")} />}

      <div className="mt-5 flex items-start gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2.5 text-[11px] leading-relaxed text-repressurizer-text-faint">
        <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-repressurizer-accent" />
        <span>{t("settings.appIdImport.reviewSafety")}</span>
      </div>
    </div>
  );
}

function ChoiceRow({ selected, title, description, badge, compact = false, onClick }: { selected: boolean; title: string; description: string; badge?: string; compact?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={`btn-press flex items-start gap-3 rounded-lg border text-left transition-colors ${compact ? "px-3 py-2.5" : "px-4 py-3"} ${selected ? "border-repressurizer-accent bg-repressurizer-accent/7" : "border-repressurizer-border-subtle bg-repressurizer-bg hover:border-repressurizer-border"}`}>
      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-repressurizer-accent" : "border-repressurizer-border"}`}>{selected && <span className="h-2 w-2 rounded-full bg-repressurizer-accent" />}</span>
      <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className={`block text-xs font-medium ${selected ? "text-repressurizer-accent" : "text-repressurizer-text"}`}>{title}</span>{badge && <span className="rounded bg-repressurizer-accent/10 px-1.5 py-0.5 text-[9px] uppercase text-repressurizer-accent">{badge}</span>}</span><span className="mt-0.5 block text-[11px] leading-relaxed text-repressurizer-text-faint">{description}</span></span>
    </button>
  );
}

function ConfirmRow({ checked, onChange, text, warning = false }: { checked: boolean; onChange: (value: boolean) => void; text: string; warning?: boolean }) {
  return <label className={`mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${warning ? "border-amber-500/25 bg-amber-500/5" : "border-repressurizer-border-subtle bg-repressurizer-bg"}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 accent-repressurizer-accent" /><span className={`text-xs leading-relaxed ${warning ? "text-amber-200" : "text-repressurizer-text"}`}>{text}</span></label>;
}

function WarningRow({ text, tone }: { text: string; tone: "danger" | "warning" }) {
  return <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${tone === "danger" ? "border-repressurizer-danger/25 bg-repressurizer-danger/5 text-repressurizer-danger" : "border-amber-500/25 bg-amber-500/5 text-amber-300"}`}><Warning size={14} className="mt-0.5 shrink-0" />{text}</div>;
}

function PreviewStat({ label, value, testId, tone = "default" }: { label: string; value: number; testId: string; tone?: "default" | "success" | "warning" }) {
  const color = tone === "success" ? "text-repressurizer-accent" : tone === "warning" ? "text-amber-300" : "text-repressurizer-text";
  return <div data-testid={testId}><p className={`font-mono text-lg font-semibold tabular-nums ${color}`}>{value.toLocaleString()}</p><p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</p></div>;
}

function SummaryChip({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-md border border-repressurizer-border-subtle bg-repressurizer-bg px-2 py-1 text-repressurizer-text-muted">{icon}{text}</span>;
}

function createCollection(key: string, name: string, appIds: number[], now: number): SteamCollection {
  return { id: key.replace("user-collections.", ""), key, name, added: appIds, removed: [], timestamp: Math.floor(now / 1000), is_deleted: false, is_dynamic: false };
}

function placeholderGame(appId: number, metadataPolicy: AppIdImportMetadataPolicy): OwnedGame {
  const cachedName = metadataPolicy === "none" ? null : useSteamAppIndexStore.getState().resolveName(appId);
  return { appid: appId, name: cachedName ?? `App ${appId}`, playtime_forever: 0, img_icon_url: null, rtime_last_played: 0, is_collection_only: true };
}

function restoreBatchInCollections(collections: SteamCollection[], batch: AppIdImportBatch): SteamCollection[] {
  return collections.map((collection) => collection.key === batch.targetKey
    ? { ...collection, added: undoAppIdImportBatch(collection.added, batch) }
    : collection);
}

function cleanupUnusedLocalGames(candidateIds: number[], collections: SteamCollection[]) {
  if (candidateIds.length === 0) return;
  const referenced = new Set(collections.flatMap((collection) => collection.added));
  useGameStore.getState().removeCollectionOnlyGames(candidateIds.filter((id) => !referenced.has(id)));
}

function sourceLabel(path: string, fallback: string): string {
  const filename = path.split(/[\\/]/).filter(Boolean).at(-1)?.replace(/\.(txt|csv|list)$/i, "").trim();
  return (filename || fallback).slice(0, 120);
}
