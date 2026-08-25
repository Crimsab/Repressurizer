import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowCounterClockwise,
  BellSimple,
  Check,
  Clock,
  Eye,
  Funnel,
  GameController,
  GearSix,
  Prohibit,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import type { InboxCategory, InboxEventStatus, LibraryInboxEvent } from "../../lib/libraryInbox";
import { useT, type TranslationKey } from "../../lib/i18n";
import { useCategoryStore } from "../../stores/categoryStore";
import { useDiaryActionHistoryStore, makeDiaryActionSnapshot } from "../../stores/diaryActionHistoryStore";
import { useDiaryStore } from "../../stores/diaryStore";
import { useGameStore } from "../../stores/gameStore";
import { useLibraryInboxStore } from "../../stores/libraryInboxStore";
import { useStatusStore } from "../../stores/statusStore";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";

type InboxFilter = "new" | "important" | "errors" | "autocat" | "installation" | "diary" | "family";

const FILTERS: Array<{ key: InboxFilter; label: TranslationKey }> = [
  { key: "new", label: "inbox.filter.new" },
  { key: "important", label: "inbox.filter.important" },
  { key: "errors", label: "inbox.filter.errors" },
  { key: "autocat", label: "inbox.filter.autocat" },
  { key: "installation", label: "inbox.filter.installation" },
  { key: "diary", label: "inbox.filter.diary" },
  { key: "family", label: "inbox.filter.family" },
];

const PREFERENCE_CATEGORIES: InboxCategory[] = ["library", "installation", "family", "metadata", "provider", "autocat", "diary", "collections", "hltb"];

export function LibraryChangesInbox({ onClose, onOpenAutoCat, onRefresh }: { onClose: () => void; onOpenAutoCat: () => void; onRefresh: () => void }) {
  const t = useT();
  const games = useGameStore((state) => state.games);
  const {
    events,
    disabledCategories,
    history,
    transition,
    undoLastAction,
    setCategoryEnabled,
  } = useLibraryInboxStore(useShallow((state) => ({
    events: state.events,
    disabledCategories: state.disabledCategories,
    history: state.history,
    transition: state.transition,
    undoLastAction: state.undoLastAction,
    setCategoryEnabled: state.setCategoryEnabled,
  })));
  const [filter, setFilter] = useState<InboxFilter>("new");
  const [selected, setSelected] = useState<string[]>([]);
  const [showPreferences, setShowPreferences] = useState(false);
  const [pendingBulk, setPendingBulk] = useState<InboxEventStatus | null>(null);
  const now = Date.now();
  const visibleEvents = useMemo(() => events.filter((event) => {
    if (event.status === "ignored" || event.status === "accepted") return false;
    if (event.status === "snoozed" && (event.snoozedUntil ?? 0) > now) return false;
    if (filter === "new") return event.status === "unread" || event.status === "snoozed";
    if (filter === "important") return event.importance === "important";
    if (filter === "errors") return event.importance === "error";
    if (filter === "autocat") return event.category === "autocat";
    return event.category === filter;
  }), [events, filter, now]);
  const selectedEvents = events.filter((event) => selected.includes(event.id));

  const applyDiaryFixes = (items: LibraryInboxEvent[]) => {
    const diaryEvents = items.filter((event) => event.recommendedAction === "fix-diary");
    const appIds = [...new Set(diaryEvents.flatMap((event) => event.appIds))];
    if (!appIds.length) return;
    const diary = useDiaryStore.getState();
    const statusStore = useStatusStore.getState();
    useDiaryActionHistoryStore.getState().push({
      label: t("inbox.history.diaryFix"),
      count: appIds.length,
      snapshot: makeDiaryActionSnapshot(appIds, diary.captureBulkSnapshot(appIds), statusStore.captureSnapshot(appIds), diary.boardPrefs),
    });
    for (const event of diaryEvents) {
      for (const appId of event.appIds) {
        if (event.kind === "diary-finished-playing") {
          diary.setDecision(appId, "archived");
        } else if (event.kind === "diary-started-not-started") {
          statusStore.setStatus(appId, "playing");
          diary.setDecision(appId, "next");
          diary.setMarkedBacklog(appId, false);
          diary.logStatusEvent(appId, "playing");
        }
      }
    }
  };

  const applyAction = (items: LibraryInboxEvent[], status: InboxEventStatus) => {
    if (status === "accepted") applyDiaryFixes(items);
    transition(items.map((event) => event.id), status, status === "snoozed" ? Date.now() + 86_400_000 : null);
    setSelected((current) => current.filter((id) => !items.some((event) => event.id === id)));
    setPendingBulk(null);
  };

  const deepLink = (event: LibraryInboxEvent) => {
    const appId = event.appIds[0];
    if (event.recommendedAction === "open-game" && appId) {
      window.dispatchEvent(new CustomEvent("repressurizer-open-game", { detail: { appId } }));
      onClose();
    } else if (event.recommendedAction === "open-collection") {
      useCategoryStore.getState().setActiveCategory("all");
      onClose();
    } else if (event.recommendedAction === "run-autocat") {
      onClose();
      onOpenAutoCat();
    } else if (event.recommendedAction === "refresh-provider") {
      onClose();
      onRefresh();
    } else {
      transition([event.id], "reviewed");
    }
  };

  return (
    <DialogOverlay label={t("inbox.title")} onClose={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-4">
      <ResizableDialogPanel dialogId="library-inbox" defaultSize={{ width: 1040, height: 780 }} minSize={{ width: 640, height: 480 }} className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog">
        {({ sizeControls }) => <>
          <header className="flex items-center justify-between border-b border-repressurizer-border px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative text-repressurizer-accent"><BellSimple size={20} weight="duotone" /></span>
              <div className="min-w-0"><h2 className="truncate text-base font-semibold text-white">{t("inbox.title")}</h2><p className="hidden text-xs text-repressurizer-text-faint sm:block">{t("inbox.description")}</p></div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={t("inbox.preferences")} onClick={() => setShowPreferences((value) => !value)} className={`btn-press flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${showPreferences ? "bg-repressurizer-accent/15 text-repressurizer-accent" : "text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"}`}><GearSix size={15} /></button>
              {sizeControls}
              <button type="button" aria-label={t("common.close")} onClick={onClose} className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"><X size={16} /></button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside className="shrink-0 border-b border-repressurizer-border-subtle p-3 md:w-52 md:border-b-0 md:border-r md:p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-repressurizer-text-faint"><Funnel size={12} />{t("inbox.filters")}</p>
              <div className="flex gap-1.5 overflow-x-auto md:block md:space-y-1">
                {FILTERS.map((item) => {
                  const count = events.filter((event) => filterMatches(event, item.key, now)).length;
                  return <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-xs transition-colors md:w-full ${filter === item.key ? "bg-repressurizer-accent/12 text-repressurizer-accent" : "text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"}`}><span>{t(item.label)}</span><span className="font-mono text-[10px]">{count}</span></button>;
                })}
              </div>
              {history.length > 0 && <button type="button" onClick={undoLastAction} className="mt-3 hidden w-full items-center justify-center gap-1.5 rounded-lg border border-repressurizer-border px-2.5 py-2 text-xs text-repressurizer-text-muted hover:text-white md:flex"><ArrowCounterClockwise size={13} />{t("inbox.undoLast")}</button>}
            </aside>

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {showPreferences ? (
                <Preferences disabled={disabledCategories} onToggle={setCategoryEnabled} />
              ) : visibleEvents.length > 0 ? (
                <div className="space-y-2">
                  {visibleEvents.map((event) => <InboxCard key={event.id} event={event} gameNames={event.appIds.map((appId) => games[appId]?.name).filter((name): name is string => !!name)} selected={selected.includes(event.id)} onSelect={(checked) => setSelected((current) => checked ? [...new Set([...current, event.id])] : current.filter((id) => id !== event.id))} onAction={(status) => applyAction([event], status)} onDeepLink={() => deepLink(event)} />)}
                </div>
              ) : (
                <div className="flex min-h-72 flex-col items-center justify-center text-center"><Check size={32} weight="duotone" className="mb-3 text-repressurizer-accent" /><p className="text-sm font-medium text-repressurizer-text">{t("inbox.empty")}</p><p className="mt-1 max-w-sm text-xs text-repressurizer-text-faint">{t("inbox.empty.description")}</p></div>
              )}
            </main>
          </div>

          {selectedEvents.length > 0 && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-repressurizer-border bg-repressurizer-bg/40 px-4 py-3"><p className="text-xs text-repressurizer-text-muted">{t("inbox.selected", { count: selectedEvents.length })}</p><div className="flex flex-wrap gap-2"><BulkButton label={t("inbox.review")} onClick={() => setPendingBulk("reviewed")} /><BulkButton label={t("inbox.ignore")} onClick={() => setPendingBulk("ignored")} /><BulkButton label={t("inbox.accept")} primary onClick={() => setPendingBulk("accepted")} /></div></footer>}

          {pendingBulk && <BulkPreview events={selectedEvents} status={pendingBulk} onCancel={() => setPendingBulk(null)} onConfirm={() => applyAction(selectedEvents, pendingBulk)} />}
        </>}
      </ResizableDialogPanel>
    </DialogOverlay>
  );
}

function filterMatches(event: LibraryInboxEvent, filter: InboxFilter, now: number): boolean {
  if (event.status === "ignored" || event.status === "accepted" || (event.status === "snoozed" && (event.snoozedUntil ?? 0) > now)) return false;
  if (filter === "new") return event.status === "unread" || event.status === "snoozed";
  if (filter === "important") return event.importance === "important";
  if (filter === "errors") return event.importance === "error";
  if (filter === "autocat") return event.category === "autocat";
  return event.category === filter;
}

function InboxCard({ event, gameNames, selected, onSelect, onAction, onDeepLink }: { event: LibraryInboxEvent; gameNames: string[]; selected: boolean; onSelect: (checked: boolean) => void; onAction: (status: InboxEventStatus) => void; onDeepLink: () => void }) {
  const t = useT();
  const sample = gameNames.slice(0, 3).join(", ");
  const detail = t(`inbox.event.${event.kind}.detail` as TranslationKey, { count: event.count, games: sample || t("inbox.unknownGames"), context: event.context ?? "" });
  return <article data-testid={`inbox-event-${event.kind}`} className={`rounded-xl border p-3 transition-colors sm:p-4 ${selected ? "border-repressurizer-accent/50 bg-repressurizer-accent/5" : "border-repressurizer-border-subtle bg-repressurizer-bg/55"}`}>
    <div className="flex items-start gap-3">
      <input type="checkbox" aria-label={t("inbox.selectEvent")} checked={selected} onChange={(event) => onSelect(event.target.checked)} className="mt-1 accent-repressurizer-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-medium text-repressurizer-text">{t(`inbox.event.${event.kind}.title` as TranslationKey, { count: event.count })}</h3><p className="mt-1 text-xs leading-relaxed text-repressurizer-text-muted">{detail}</p></div><span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${event.importance === "error" ? "border-repressurizer-danger/25 bg-repressurizer-danger/10 text-repressurizer-danger" : event.importance === "important" ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : "border-repressurizer-border text-repressurizer-text-faint"}`}>{t(`inbox.importance.${event.importance}` as TranslationKey)}</span></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-repressurizer-text-faint"><span>{event.source}</span><span>{t("inbox.confidence", { level: t(`inbox.confidence.${event.confidence}` as TranslationKey) })}</span><span>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(event.occurredAt)}</span></div>
        <div className="mt-3 flex flex-wrap gap-1.5"><ActionButton icon={<Check size={12} />} label={t("inbox.accept")} onClick={() => onAction("accepted")} /><ActionButton icon={<Eye size={12} />} label={t("inbox.review")} onClick={() => onAction("reviewed")} /><ActionButton icon={<Clock size={12} />} label={t("inbox.snooze")} onClick={() => onAction("snoozed")} /><ActionButton icon={<Prohibit size={12} />} label={t("inbox.ignore")} onClick={() => onAction("ignored")} /><ActionButton icon={<GameController size={12} />} label={t(`inbox.action.${event.recommendedAction}` as TranslationKey)} onClick={onDeepLink} /></div>
      </div>
    </div>
  </article>;
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-repressurizer-border px-2 py-1 text-[10px] text-repressurizer-text-muted hover:border-repressurizer-accent/50 hover:text-white">{icon}{label}</button>; }
function BulkButton({ label, primary = false, onClick }: { label: string; primary?: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${primary ? "bg-repressurizer-accent text-white" : "border border-repressurizer-border text-repressurizer-text-muted hover:text-white"}`}>{label}</button>; }

function Preferences({ disabled, onToggle }: { disabled: InboxCategory[]; onToggle: (category: InboxCategory, enabled: boolean) => void }) {
  const t = useT();
  return <section data-testid="inbox-preferences"><div className="mb-4"><h3 className="text-sm font-semibold text-repressurizer-text">{t("inbox.preferences")}</h3><p className="mt-1 text-xs text-repressurizer-text-faint">{t("inbox.preferences.description")}</p></div><div className="grid gap-2 sm:grid-cols-2">{PREFERENCE_CATEGORIES.map((category) => <label key={category} className="flex items-center justify-between rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/50 px-3 py-2.5 text-xs text-repressurizer-text-muted"><span>{t(`inbox.category.${category}` as TranslationKey)}</span><input type="checkbox" checked={!disabled.includes(category)} onChange={(event) => onToggle(category, event.target.checked)} className="accent-repressurizer-accent" /></label>)}</div></section>;
}

function BulkPreview({ events, status, onCancel, onConfirm }: { events: LibraryInboxEvent[]; status: InboxEventStatus; onCancel: () => void; onConfirm: () => void }) {
  const t = useT();
  const mutating = status === "accepted" && events.some((event) => event.recommendedAction === "fix-diary");
  return <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><section role="alertdialog" aria-label={t("inbox.bulkPreview")} className="w-full max-w-md rounded-xl border border-repressurizer-border bg-repressurizer-surface p-5 shadow-dialog"><Warning size={24} weight="duotone" className={mutating ? "text-amber-300" : "text-repressurizer-accent"} /><h3 className="mt-3 text-base font-semibold text-white">{t("inbox.bulkPreview")}</h3><p className="mt-2 text-sm text-repressurizer-text-muted">{t("inbox.bulkPreview.description", { action: t(`inbox.status.${status}` as TranslationKey), count: events.length })}</p>{mutating && <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">{t("inbox.bulkPreview.reversible")}</p>}<div className="mt-5 flex justify-end gap-2"><BulkButton label={t("common.cancel")} onClick={onCancel} /><BulkButton primary label={t("inbox.confirm")} onClick={onConfirm} /></div></section></div>;
}
