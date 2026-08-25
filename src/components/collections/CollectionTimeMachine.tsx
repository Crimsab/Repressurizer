import { useEffect, useMemo, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { ArrowCounterClockwise, DownloadSimple, PushPin, X } from "@phosphor-icons/react";
import {
  buildSelectiveRestore,
  diffCollectionSnapshots,
  type CollectionSnapshot,
  type SelectiveRestoreMode,
  type SnapshotRetention,
} from "../../lib/collectionTimeMachine";
import { createManualBackup } from "../../lib/tauri";
import { useT, type TranslationKey } from "../../lib/i18n";
import { useCategoryStore } from "../../stores/categoryStore";
import { useCollectionTimeMachineStore } from "../../stores/collectionTimeMachineStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useToastStore } from "../../stores/toastStore";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";
import { SelectMenu } from "../ui/SelectMenu";

interface RestorePreview {
  target: CollectionSnapshot;
  mode: SelectiveRestoreMode;
  identity: string | null;
  collections: CollectionSnapshot["collections"];
}

function snapshotLabel(snapshot: CollectionSnapshot): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(snapshot.createdAt);
}

export function CollectionTimeMachine({ onClose }: { onClose: () => void }) {
  const t = useT();
  const timeMachine = useCollectionTimeMachineStore();
  const collections = useCategoryStore((state) => state.collections);
  const applyImportedCollections = useCategoryStore((state) => state.applyImportedCollections);
  const { steamPath, steamId3 } = useSettingsStore();
  const toast = useToastStore;
  const events = useMemo(() => [...timeMachine.events].reverse(), [timeMachine.events]);
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const [leftId, setLeftId] = useState(selectedEvent?.beforeSnapshotId ?? timeMachine.snapshots[0]?.id ?? "");
  const [rightId, setRightId] = useState(selectedEvent?.afterSnapshotId ?? timeMachine.snapshots.at(-1)?.id ?? "");
  const [restoreMode, setRestoreMode] = useState<SelectiveRestoreMode>("full");
  const [restoreIdentity, setRestoreIdentity] = useState("");
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!selectedEvent) return;
    setLeftId(selectedEvent.beforeSnapshotId);
    setRightId(selectedEvent.afterSnapshotId);
  }, [selectedEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = timeMachine.getSnapshot(leftId);
  const right = timeMachine.getSnapshot(rightId);
  const comparison = useMemo(() => left && right ? diffCollectionSnapshots(left.collections, right.collections) : null, [left, right]);
  const target = left;
  const selectableChanges = target ? diffCollectionSnapshots(collections, target.collections).changes : [];

  const openRestorePreview = () => {
    if (!target) return;
    const identity = restoreMode === "collection" ? restoreIdentity || selectableChanges[0]?.identity || null : null;
    const next = buildSelectiveRestore({ current: collections, target: target.collections, mode: restoreMode, identity });
    setPreview({ target, mode: restoreMode, identity, collections: next });
  };

  const applyRestore = async () => {
    if (!preview || restoring) return;
    if (!steamPath.trim() || !steamId3.trim()) {
      toast.getState().error(t("timeMachine.restore.backupUnavailable"));
      return;
    }
    setRestoring(true);
    try {
      await createManualBackup(steamPath, steamId3, "Collection Time Machine pre-restore");
      applyImportedCollections(preview.collections, "restore");
      setPreview(null);
      toast.getState().success(t("timeMachine.restore.applied"));
    } catch (error) {
      toast.getState().error(t("timeMachine.restore.failed", { error: String(error) }));
    } finally {
      setRestoring(false);
    }
  };

  const exportSnapshot = async () => {
    if (!target) return;
    const path = await saveDialog({ defaultPath: `repressurizer-collection-snapshot-${target.createdAt}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    await writeTextFile(path, JSON.stringify(target, null, 2));
    toast.getState().success(t("timeMachine.exported"));
  };

  return <DialogOverlay label={t("timeMachine.title")} onClose={onClose} className="fixed inset-0 z-[80] flex items-center justify-center overflow-x-hidden bg-black/70 p-3 backdrop-blur-md sm:p-4">
    <ResizableDialogPanel dialogId="collection-time-machine" defaultSize={{ width: 1120, height: 760 }} minSize={{ width: 680, height: 520 }} className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog">
      {({ sizeControls }) => <>
      <header className="flex items-start justify-between border-b border-repressurizer-border-subtle px-4 py-3">
        <div><h2 className="text-base font-semibold text-white">{t("timeMachine.title")}</h2><p className="text-xs text-repressurizer-text-faint">{t("timeMachine.subtitle")}</p></div>
        <div className="flex items-center gap-1">{sizeControls}<button aria-label={t("common.close")} onClick={onClose} className="rounded-lg p-1.5 text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"><X size={16} /></button></div>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b border-repressurizer-border-subtle p-3 md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-repressurizer-text-faint">{t("timeMachine.timeline")}</span>
            <SelectMenu value={timeMachine.retention} onChange={(value) => timeMachine.setRetention(value as SnapshotRetention)} options={[{ value: "all", label: t("timeMachine.retention.all") }, { value: "30-days", label: t("timeMachine.retention.30days") }, { value: "100-snapshots", label: t("timeMachine.retention.100") }]} ariaLabel={t("timeMachine.retention")} size="sm" />
          </div>
          {events.length ? <div className="space-y-2">{events.map((event) => <button data-testid={`time-machine-event-${event.id}`} key={event.id} onClick={() => setSelectedEventId(event.id)} className={`w-full rounded-xl border p-3 text-left ${selectedEvent?.id === event.id ? "border-repressurizer-accent bg-repressurizer-accent/5" : "border-repressurizer-border-subtle bg-repressurizer-bg/45"}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-white">{t(`timeMachine.origin.${event.origin}` as TranslationKey)}</span><time className="text-[9px] text-repressurizer-text-faint">{new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(event.occurredAt)}</time></div>
            <p className="mt-1 text-[10px] text-repressurizer-text-muted">{t("timeMachine.event.summary", { collections: event.diff.created + event.diff.deleted + event.diff.renamed + event.diff.colors + event.diff.reordered, added: event.diff.gamesAdded, removed: event.diff.gamesRemoved })}</p>
          </button>)}</div> : <p className="py-16 text-center text-xs text-repressurizer-text-faint">{t("timeMachine.empty")}</p>}
        </aside>
        <main className="min-h-0 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SnapshotSelect label={t("timeMachine.compare.left")} value={leftId} snapshots={timeMachine.snapshots} onChange={setLeftId} />
            <SnapshotSelect label={t("timeMachine.compare.right")} value={rightId} snapshots={timeMachine.snapshots} onChange={setRightId} />
          </div>
          {comparison ? <>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Metric label={t("timeMachine.created")} value={comparison.created} /><Metric label={t("timeMachine.deleted")} value={comparison.deleted} /><Metric label={t("timeMachine.renamed")} value={comparison.renamed} /><Metric label={t("timeMachine.colors")} value={comparison.colors} /><Metric label={t("timeMachine.gamesAdded")} value={comparison.gamesAdded} /><Metric label={t("timeMachine.gamesRemoved")} value={comparison.gamesRemoved} />
            </div>
            <section className="mt-4 space-y-2">{comparison.changes.map((change) => <div key={change.identity} className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/45 p-3">
              <div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-medium text-white">{change.before?.name ?? change.after?.name ?? change.identity}</p><span className="font-mono text-[9px] text-repressurizer-text-faint">{change.identity}</span></div>
              <p className="mt-1 text-[10px] text-repressurizer-text-muted">{change.renamed ? `${change.before?.name} → ${change.after?.name} · ` : ""}{change.colorChanged ? `${t("timeMachine.colorChanged")} · ` : ""}{change.orderChanged ? `${t("timeMachine.orderChanged")} · ` : ""}+{change.addedGameIds.length} / −{change.removedGameIds.length}</p>
            </div>)}</section>
          </> : <p className="py-16 text-center text-xs text-repressurizer-text-faint">{t("timeMachine.selectTwo")}</p>}
          {target && <section className="sticky bottom-0 mt-5 rounded-xl border border-repressurizer-border bg-repressurizer-surface/95 p-3 shadow-pop backdrop-blur">
            <div className="flex flex-wrap items-end gap-2">
              <SelectMenu value={restoreMode} onChange={(value) => setRestoreMode(value as SelectiveRestoreMode)} options={[{ value: "full", label: t("timeMachine.restore.full") }, { value: "collection", label: t("timeMachine.restore.collection") }, { value: "added", label: t("timeMachine.restore.added") }, { value: "removed", label: t("timeMachine.restore.removed") }, { value: "rename", label: t("timeMachine.restore.rename") }]} label={t("timeMachine.restore.mode")} ariaLabel={t("timeMachine.restore.mode")} className="min-w-40 flex-1" size="sm" />
              {restoreMode === "collection" && <SelectMenu value={restoreIdentity} onChange={setRestoreIdentity} options={selectableChanges.map((change) => ({ value: change.identity, label: change.after?.name ?? change.before?.name ?? change.identity }))} label={t("timeMachine.restore.chooseCollection")} ariaLabel={t("timeMachine.restore.chooseCollection")} className="min-w-44 flex-1" size="sm" />}
              <button onClick={() => timeMachine.togglePinned(target.id)} className="inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted"><PushPin size={13} />{t(timeMachine.pinnedSnapshotIds.includes(target.id) ? "timeMachine.unpin" : "timeMachine.pin")}</button>
              <button onClick={() => void exportSnapshot()} className="inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted"><DownloadSimple size={13} />{t("timeMachine.export")}</button>
              <button onClick={openRestorePreview} className="inline-flex items-center gap-1 rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white"><ArrowCounterClockwise size={13} />{t("timeMachine.restore.preview")}</button>
            </div>
          </section>}
        </main>
      </div>
      {preview && <RestorePreviewDialog preview={preview} current={collections} restoring={restoring} onCancel={() => setPreview(null)} onConfirm={() => void applyRestore()} />}
      </>}
    </ResizableDialogPanel>
  </DialogOverlay>;
}

function SnapshotSelect({ label, value, snapshots, onChange }: { label: string; value: string; snapshots: CollectionSnapshot[]; onChange: (value: string) => void }) {
  return <SelectMenu value={value} onChange={onChange} options={snapshots.map((snapshot) => ({ value: snapshot.id, label: snapshotLabel(snapshot) }))} label={label} ariaLabel={label} />;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/55 p-2 text-center"><p className="font-mono text-sm text-white">{value}</p><p className="text-[9px] text-repressurizer-text-faint">{label}</p></div>; }

function RestorePreviewDialog({ preview, current, restoring, onCancel, onConfirm }: { preview: RestorePreview; current: CollectionSnapshot["collections"]; restoring: boolean; onCancel: () => void; onConfirm: () => void }) {
  const t = useT(); const diff = diffCollectionSnapshots(current, preview.collections);
  return <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><section role="alertdialog" aria-label={t("timeMachine.restore.previewTitle")} className="w-full max-w-lg rounded-xl border border-repressurizer-border bg-repressurizer-surface p-5"><h3 className="text-base font-semibold text-white">{t("timeMachine.restore.previewTitle")}</h3><p className="mt-2 text-sm text-repressurizer-text-muted">{t("timeMachine.restore.previewSummary", { created: diff.created, deleted: diff.deleted, added: diff.gamesAdded, removed: diff.gamesRemoved })}</p><p className="mt-2 text-xs text-amber-300">{t("timeMachine.restore.backupNotice")}</p><p className="mt-2 text-xs text-repressurizer-text-faint">{t("timeMachine.restore.unsaved")}</p><div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} disabled={restoring} className="rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted">{t("common.cancel")}</button><button onClick={onConfirm} disabled={restoring} className="rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{restoring ? t("timeMachine.restore.backingUp") : t("timeMachine.restore.confirm")}</button></div></section></div>;
}
