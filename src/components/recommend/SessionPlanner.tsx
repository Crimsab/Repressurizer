import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";
import {
  ArrowDown, ArrowUp, Check, Clock, FloppyDisk, GameController, ListChecks,
  Minus, Play, Plus, PushPin, Shuffle, SlidersHorizontal, Trash, X,
} from "@phosphor-icons/react";
import { DEFAULT_RANKING_WEIGHTS } from "../../lib/backlogRanking";
import { isSharedFamilyApp } from "../../lib/familyLibrary";
import { planSession, type PlannerDevice, type PlannerInput, type PlannerIntent, type PlannerMode, type PlannerRequirementMode, type SessionPlannerCandidate } from "../../lib/sessionPlanner";
import { isSteamRunning } from "../../lib/tauri";
import { useT, type TranslationKey } from "../../lib/i18n";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useDiaryStore } from "../../stores/diaryStore";
import { useFamilyStore } from "../../stores/familyStore";
import { useGameStore } from "../../stores/gameStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useSessionPlannerStore, type TonightQueueItemStatus } from "../../stores/sessionPlannerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useStatusStore } from "../../stores/statusStore";
import { useSteamRatingsStore } from "../../stores/steamRatingsStore";
import { useToastStore } from "../../stores/toastStore";
import { useWishlistStore } from "../../stores/wishlistStore";
import { SteamImage } from "../games/SteamImage";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";

type PlannerTab = "planner" | "queue" | "history";
const DURATIONS = [15, 30, 45, 60, 90, 120];

export function SessionPlanner({ onClose }: { onClose: () => void }) {
  const t = useT();
  const games = useGameStore((state) => state.games);
  const details = useGameStore((state) => state.details);
  const installedAppIds = useGameStore((state) => state.installedAppIds);
  const installedDataReady = useGameStore((state) => state.installedLibraryReady);
  const hltbData = useHltbStore((state) => state.data);
  const achievements = useAchievementsStore((state) => state.summaries);
  const ratings = useSteamRatingsStore((state) => state.ratings);
  const wishlistItems = useWishlistStore((state) => state.items);
  const statuses = useStatusStore((state) => state.statuses);
  const diaryEntries = useDiaryStore((state) => state.entries);
  const collections = useCategoryStore((state) => state.collections);
  const familyApps = useFamilyStore((state) => state.apps);
  const hltbTimeMode = useSettingsStore((state) => state.hltbTimeMode);
  const detailsMaxAgeDays = useSettingsStore((state) => state.detailsCacheMaxAgeDays);
  const planner = useSessionPlannerStore();
  const [tab, setTab] = useState<PlannerTab>("planner");
  const [seed, setSeed] = useState(0);
  const [rerollExcluded, setRerollExcluded] = useState<number[]>([]);
  const [showRequirements, setShowRequirements] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [draggedAppId, setDraggedAppId] = useState<number | null>(null);
  const [collectionPreview, setCollectionPreview] = useState(false);
  const toast = useToastStore;

  useEffect(() => { void planner.hydrate(); }, []);
  useEffect(() => {
    if (planner.config.device === "deck" && !planner.config.deckCompatible) {
      planner.setConfig({ deckCompatible: true });
    }
  }, [planner.config.deckCompatible, planner.config.device]);

  const hiddenAppIds = useMemo(() => new Set(collections.find((collection) => collection.id === "hidden")?.added ?? []), [collections]);
  const familyAppIds = useMemo(() => new Set(Object.values(familyApps).filter(isSharedFamilyApp).map((app) => app.appid)), [familyApps]);
  const suppressedAppIds = useMemo(() => new Set([
    ...planner.permanentlySuppressed,
    ...Object.entries(planner.hiddenUntil).filter(([, until]) => until > Date.now()).map(([appId]) => Number(appId)),
    ...rerollExcluded,
  ]), [planner.hiddenUntil, planner.permanentlySuppressed, rerollExcluded]);
  const result = useMemo(() => planSession({
    config: planner.config,
    games: Object.values(games), details, hltbData, hltbTimeMode, achievements, ratings, wishlistItems,
    installedAppIds: new Set(installedAppIds), installedDataReady, familyAppIds, statuses,
    diaryDecisions: Object.fromEntries(Object.entries(diaryEntries).map(([appId, entry]) => [Number(appId), entry.decision])),
    hiddenAppIds, suppressedAppIds, frequency: planner.frequency, pinnedAppId: planner.pinnedAppId,
    rankingMode: planner.config.intent === "short" ? "quick" : planner.config.intent === "random" ? "surprise" : "smart",
    rankingWeights: DEFAULT_RANKING_WEIGHTS, seed, now: Date.now(), detailsMaxAgeDays,
  }), [achievements, details, detailsMaxAgeDays, diaryEntries, familyAppIds, games, hiddenAppIds, hltbData, hltbTimeMode, installedAppIds, installedDataReady, planner.config, planner.frequency, planner.hiddenUntil, planner.permanentlySuppressed, planner.pinnedAppId, ratings, rerollExcluded, seed, statuses, suppressedAppIds, wishlistItems]);
  const recommendations = [result.best, result.shorter, result.different].filter((item): item is SessionPlannerCandidate => !!item);

  useEffect(() => {
    recommendations.forEach((item) => planner.logRecommendation(item.game.appid, "recommended"));
    // Log only when the recommendation set changes, not for unrelated store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendations.map((item) => item.game.appid).join(",")]);

  const reroll = () => {
    setRerollExcluded(recommendations.map((item) => item.game.appid));
    setSeed((value) => value + 1);
    if (result.eligibleCount <= recommendations.length) setRerollExcluded([]);
  };

  const launch = async (appId: number) => {
    const installed = installedAppIds.includes(appId);
    const running = await isSteamRunning().catch(() => false);
    if (!installed || !running) {
      const accepted = await confirm(t(!installed ? "planner.launch.notInstalled" : "planner.launch.steamClosed"), { title: t("planner.launch.confirmTitle"), kind: "warning" });
      if (!accepted) return;
    }
    try {
      await open(`steam://rungameid/${appId}`);
      planner.logRecommendation(appId, "launched");
    } catch (error) { toast.getState().error(t("planner.launch.failed", { error: String(error) })); }
  };

  return <DialogOverlay label={t("planner.title")} onClose={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-4">
    <ResizableDialogPanel dialogId="session-planner" defaultSize={{ width: 1080, height: 820 }} minSize={{ width: 640, height: 520 }} className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog">
      {({ sizeControls }) => <>
        <header className="flex items-center justify-between border-b border-repressurizer-border px-4 py-3 sm:px-6"><div className="flex items-center gap-2.5"><GameController size={19} weight="duotone" className="text-repressurizer-accent" /><div><h2 className="text-base font-semibold text-white">{t("planner.title")}</h2><p className="hidden text-xs text-repressurizer-text-faint sm:block">{t("planner.description")}</p></div></div><div className="flex items-center gap-1">{sizeControls}<button aria-label={t("common.close")} onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"><X size={16} /></button></div></header>
        <nav className="flex border-b border-repressurizer-border-subtle px-3 sm:px-5">{(["planner", "queue", "history"] as PlannerTab[]).map((value) => <button data-testid={`planner-tab-${value}`} key={value} onClick={() => setTab(value)} className={`border-b-2 px-3 py-2.5 text-xs font-medium ${tab === value ? "border-repressurizer-accent text-repressurizer-accent" : "border-transparent text-repressurizer-text-muted hover:text-white"}`}>{t(`planner.tab.${value}` as TranslationKey)}{value === "queue" && planner.queue.length > 0 ? ` (${planner.queue.length})` : ""}</button>)}</nav>
        {tab === "planner" && <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="space-y-3 border-b border-repressurizer-border-subtle bg-repressurizer-bg/35 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-repressurizer-text-faint">{t("planner.duration")}</span>{DURATIONS.map((minutes) => <button data-testid={`planner-duration-${minutes}`} key={minutes} onClick={() => planner.setConfig({ durationMinutes: minutes })} className={`rounded-lg border px-2.5 py-1 text-xs ${planner.config.durationMinutes === minutes ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent" : "border-repressurizer-border text-repressurizer-text-muted"}`}>{minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}</button>)}<label className="flex items-center gap-1 text-xs text-repressurizer-text-muted"><input aria-label={t("planner.duration.custom")} type="number" min={5} max={720} value={planner.config.durationMinutes} onChange={(event) => planner.setConfig({ durationMinutes: Math.max(5, Number(event.target.value) || 5) })} className="w-16 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2 py-1 text-right font-mono text-repressurizer-text" />m</label></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Select label={t("planner.device")} value={planner.config.device} onChange={(value) => planner.setConfig({ device: value as PlannerDevice })} options={(["desktop", "laptop", "deck", "custom"] as PlannerDevice[]).map((value) => ({ value, label: t(`planner.device.${value}` as TranslationKey) }))} /><Select label={t("planner.input")} value={planner.config.input} onChange={(value) => planner.setConfig({ input: value as PlannerInput })} options={(["keyboard", "controller", "both", "touch"] as PlannerInput[]).map((value) => ({ value, label: t(`planner.input.${value}` as TranslationKey) }))} /><Select label={t("planner.mode")} value={planner.config.mode} onChange={(value) => planner.setConfig({ mode: value as PlannerMode })} options={(["any", "single", "local-coop", "online-coop", "competitive"] as PlannerMode[]).map((value) => ({ value, label: t(`planner.mode.${value}` as TranslationKey) }))} /><Select label={t("planner.intent")} value={planner.config.intent} onChange={(value) => planner.setConfig({ intent: value as PlannerIntent })} options={(["new", "continue", "finish", "short", "achievements", "relaxing", "difficult", "random"] as PlannerIntent[]).map((value) => ({ value, label: t(`planner.intent.${value}` as TranslationKey) }))} /></div>
            {planner.config.device === "custom" && <input value={planner.config.customDeviceName} onChange={(event) => planner.setConfig({ customDeviceName: event.target.value.slice(0, 60) })} placeholder={t("planner.device.customName")} className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text sm:max-w-xs" />}
            <div className="flex flex-wrap items-center justify-between gap-2"><button onClick={() => setShowRequirements((value) => !value)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${showRequirements ? "border-repressurizer-accent text-repressurizer-accent" : "border-repressurizer-border text-repressurizer-text-muted"}`}><SlidersHorizontal size={13} />{t("planner.requirements")}</button><div className="flex gap-2"><input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={t("planner.preset.name")} className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 py-1.5 text-xs text-repressurizer-text" /><button onClick={() => { const id = planner.savePreset(presetName); if (id) setPresetName(""); }} className="inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-2.5 py-1.5 text-xs text-repressurizer-text-muted"><FloppyDisk size={12} />{t("planner.preset.save")}</button></div></div>
            {showRequirements && <RequirementsPanel />}
            {planner.presets.length > 0 && <div className="flex gap-1.5 overflow-x-auto">{planner.presets.map((preset) => <button key={preset.id} onClick={() => planner.loadPreset(preset.id)} className="shrink-0 rounded-full border border-repressurizer-border px-2.5 py-1 text-[10px] text-repressurizer-text-muted hover:text-white">{preset.name}</button>)}</div>}
          </section>
          <section className="p-3 sm:p-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs text-repressurizer-text-muted">{t("planner.resultCount", { eligible: result.eligibleCount, excluded: result.excludedCount })}</p><button onClick={reroll} className="inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted hover:text-white"><Shuffle size={13} />{t("planner.reroll")}</button></div>{recommendations.length ? <div className="grid gap-3 lg:grid-cols-3">{recommendations.map((candidate, index) => <RecommendationCard key={candidate.game.appid} candidate={candidate} role={index === 0 ? "best" : index === 1 ? "shorter" : "different"} onLaunch={() => launch(candidate.game.appid)} />)}</div> : <div className="py-16 text-center text-sm text-repressurizer-text-faint">{t("planner.empty")}</div>}</section>
        </div>}
        {tab === "queue" && <QueuePanel games={games} installedAppIds={new Set(installedAppIds)} manualQuery={manualQuery} setManualQuery={setManualQuery} draggedAppId={draggedAppId} setDraggedAppId={setDraggedAppId} onLaunch={launch} onCollectionPreview={() => setCollectionPreview(true)} />}
        {tab === "history" && <HistoryPanel />}
        {collectionPreview && <CollectionPreview onCancel={() => setCollectionPreview(false)} onConfirm={() => { useCategoryStore.getState().addCategoryWithGames(`Tonight Queue ${new Date().toLocaleDateString()}`, planner.queue.map((item) => item.appId)); setCollectionPreview(false); toast.getState().success(t("planner.queue.collectionCreated")); }} />}
      </>}
    </ResizableDialogPanel>
  </DialogOverlay>;
}

function RequirementsPanel() {
  const t = useT(); const { config, setConfig } = useSessionPlannerStore();
  return <div data-testid="planner-requirements" className="grid gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface/50 p-3 sm:grid-cols-2 lg:grid-cols-4"><Select label={t("planner.installation")} value={config.installed} onChange={(value) => setConfig({ installed: value as PlannerRequirementMode })} options={(["any", "require", "exclude"] as PlannerRequirementMode[]).map((value) => ({ value, label: t(`planner.requirement.${value}` as TranslationKey) }))} /><Toggle label={t("planner.familyAvailable")} checked={config.familyAvailable} onChange={(value) => setConfig({ familyAvailable: value })} /><Toggle label={t("planner.deckCompatible")} checked={config.deckCompatible} onChange={(value) => setConfig({ deckCompatible: value })} /><Toggle label={t("planner.controlledRandom")} checked={config.controlledRandom} onChange={(value) => setConfig({ controlledRandom: value })} /><TextRequirement label={t("planner.genre")} value={config.genre} required={config.genreRequired} onValue={(genre) => setConfig({ genre })} onRequired={(genreRequired) => setConfig({ genreRequired })} /><TextRequirement label={t("planner.tag")} value={config.tag} required={config.tagRequired} onValue={(tag) => setConfig({ tag })} onRequired={(tagRequired) => setConfig({ tagRequired })} /><RangeRequirement label={t("planner.hltbRange")} min={config.minHltbHours} max={config.maxHltbHours} required={config.hltbRequired} onMin={(minHltbHours) => setConfig({ minHltbHours })} onMax={(maxHltbHours) => setConfig({ maxHltbHours })} onRequired={(hltbRequired) => setConfig({ hltbRequired })} /><NumberField label={t("planner.minReviews")} value={config.minSteamReviewPercent} onChange={(minSteamReviewPercent) => setConfig({ minSteamReviewPercent })} /><NumberField label={t("planner.minMetacritic")} value={config.minMetacritic} onChange={(minMetacritic) => setConfig({ minMetacritic })} /><NumberField label={t("planner.lastPlayedDays")} value={config.maxDaysSincePlayed} onChange={(maxDaysSincePlayed) => setConfig({ maxDaysSincePlayed })} /><NumberField label={t("planner.minPlaytime")} value={config.minPlaytimeHours} onChange={(minPlaytimeHours) => setConfig({ minPlaytimeHours })} /><NumberField label={t("planner.maxPlaytime")} value={config.maxPlaytimeHours} onChange={(maxPlaytimeHours) => setConfig({ maxPlaytimeHours })} /><Select label={t("planner.diaryStatus")} value={config.diaryStatus} onChange={(diaryStatus) => setConfig({ diaryStatus })} options={["", "backlog", "next", "playing", "completed", "abandoned", "archived"].map((value) => ({ value, label: value || t("planner.any") }))} /><NumberField label={t("planner.minAchievements")} value={config.minAchievementPercent} onChange={(minAchievementPercent) => setConfig({ minAchievementPercent })} /><NumberField label={t("planner.maxAchievements")} value={config.maxAchievementPercent} onChange={(maxAchievementPercent) => setConfig({ maxAchievementPercent })} /></div>;
}

function RecommendationCard({ candidate, role, onLaunch }: { candidate: SessionPlannerCandidate; role: "best" | "shorter" | "different"; onLaunch: () => void }) {
  const t = useT(); const planner = useSessionPlannerStore();
  return <article data-testid={`planner-result-${role}`} className="overflow-hidden rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/60"><div className="relative h-28"><SteamImage appId={candidate.game.appid} alt="" kind="header" className="h-full w-full object-cover" /><span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-repressurizer-accent backdrop-blur">{t(`planner.role.${role}` as TranslationKey)}</span></div><div className="p-3"><div className="flex items-start justify-between gap-2"><h3 className="min-w-0 truncate text-sm font-semibold text-white">{candidate.game.name}</h3><span className="font-mono text-xs text-repressurizer-accent">{Math.round(candidate.adjustedScore)}</span></div><div className="mt-2 space-y-1 text-[10px] text-repressurizer-text-muted">{candidate.requirementsPassed.slice(0, 2).map((reason) => <p key={reason} className="flex gap-1"><Check size={11} className="mt-0.5 shrink-0 text-repressurizer-accent" />{reason}</p>)}{candidate.preferenceReasons.slice(0, 2).map((reason) => <p key={reason}>{reason}</p>)}{candidate.missingData.length > 0 && <p className="text-amber-300">{t("planner.missing", { data: candidate.missingData.slice(0, 2).join(", ") })}</p>}{candidate.staleData && <p className="text-amber-300">{t("planner.stale")}</p>}</div><div className="mt-3 flex flex-wrap gap-1"><MiniAction label={t("planner.queue.add")} onClick={() => planner.addToQueue(candidate.game.appid)} icon={<Plus size={11} />} /><MiniAction label={t("planner.launch")} onClick={onLaunch} icon={<Play size={11} />} /><MiniAction label={t("planner.pin")} onClick={() => planner.pin(candidate.game.appid)} icon={<PushPin size={11} />} /></div><div className="mt-2 flex flex-wrap gap-1"><TextAction label={t("planner.hideToday")} onClick={() => { planner.suppressToday(candidate.game.appid); planner.logRecommendation(candidate.game.appid, "hidden"); }} /><TextAction label={t("planner.never")} onClick={() => planner.suppressPermanently(candidate.game.appid)} /><TextAction label={t("planner.lessOften")} onClick={() => planner.adjustFrequency(candidate.game.appid, -1)} /><TextAction label={t("planner.moreOften")} onClick={() => planner.adjustFrequency(candidate.game.appid, 1)} /></div></div></article>;
}

interface QueuePanelProps {
  games: ReturnType<typeof useGameStore.getState>["games"];
  installedAppIds: Set<number>;
  manualQuery: string;
  setManualQuery: (value: string) => void;
  draggedAppId: number | null;
  setDraggedAppId: (value: number | null) => void;
  onLaunch: (appId: number) => void;
  onCollectionPreview: () => void;
}

function QueuePanel({ games, installedAppIds, manualQuery, setManualQuery, draggedAppId, setDraggedAppId, onLaunch, onCollectionPreview }: QueuePanelProps) {
  const t = useT();
  const planner = useSessionPlannerStore();
  const total = planner.queue
    .filter((item) => item.status !== "skipped")
    .reduce((sum, item) => sum + item.durationMinutes, 0);
  const next = planner.queue.find((item) => item.status === "pending");
  const matches = Object.values(games)
    .filter((game) => manualQuery.trim()
      && game.name.toLocaleLowerCase().includes(manualQuery.trim().toLocaleLowerCase())
      && !planner.queue.some((item) => item.appId === game.appid))
    .slice(0, 5);

  return <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <div>
        <h3 className="text-sm font-semibold text-white">{t("planner.queue.title")}</h3>
        <p className={`mt-1 text-xs ${total > planner.config.durationMinutes ? "text-amber-300" : "text-repressurizer-text-faint"}`}>
          {t("planner.queue.total", { total, budget: planner.config.durationMinutes })}
          {total > planner.config.durationMinutes ? ` · ${t("planner.queue.over")}` : ""}
        </p>
        {next && <p className="mt-1 text-xs text-repressurizer-accent">{t("planner.queue.next", { game: games[next.appId]?.name ?? next.appId })}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => planner.saveCurrentQueue("Tonight Queue")} className="rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted">{t("planner.queue.saveList")}</button>
        <button onClick={() => planner.savePreset("Tonight Queue")} className="rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted">{t("planner.queue.toPreset")}</button>
        <button onClick={onCollectionPreview} disabled={!planner.queue.length} className="rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted disabled:opacity-40">{t("planner.queue.toCollection")}</button>
      </div>
    </div>
    <div className="relative mb-4">
      <input data-testid="queue-manual-search" value={manualQuery} onChange={(event) => setManualQuery(event.target.value)} placeholder={t("planner.queue.manual")} className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-xs text-repressurizer-text" />
      {matches.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface p-1 shadow-pop">
        {matches.map((game) => <button key={game.appid} onClick={() => { planner.addToQueue(game.appid, 30); setManualQuery(""); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs text-repressurizer-text hover:bg-repressurizer-surface-hover"><span>{game.name}</span><Plus size={12} /></button>)}
      </div>}
    </div>
    {planner.queue.length ? <div className="space-y-2">
      {planner.queue.map((item, index) => <div data-testid={`queue-item-${item.appId}`} key={item.appId} draggable onDragStart={() => setDraggedAppId(item.appId)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedAppId) planner.reorderQueue(draggedAppId, item.appId); setDraggedAppId(null); }} className="flex flex-wrap items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/55 p-3">
        <span className="w-5 font-mono text-xs text-repressurizer-text-faint">{index + 1}</span>
        <SteamImage appId={item.appId} alt="" kind="header" className="h-9 w-16 rounded object-cover" />
        <div className="min-w-32 flex-1">
          <p className="truncate text-sm text-white">{games[item.appId]?.name ?? `App ${item.appId}`}</p>
          <p className="text-[10px] text-repressurizer-text-faint">
            {installedAppIds.has(item.appId) ? t("planner.queue.installed") : t("planner.queue.notInstalled")} · <span className={item.status === "pending" ? "" : "text-repressurizer-accent"}>{t(`planner.queue.${item.status}` as TranslationKey)}</span>
          </p>
        </div>
        <label className="flex items-center gap-1 text-[10px] text-repressurizer-text-faint">
          <input aria-label={t("planner.queue.duration")} type="number" min={5} max={720} step={5} value={item.durationMinutes} onChange={(event) => planner.setQueueDuration(item.appId, Number(event.target.value))} className="w-16 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2 py-1 text-xs text-repressurizer-text" />m
        </label>
        <div className="flex flex-wrap gap-1">
          <MiniIcon label={t("planner.queue.up")} onClick={() => planner.moveQueueItem(item.appId, -1)} icon={<ArrowUp size={12} />} />
          <MiniIcon label={t("planner.queue.down")} onClick={() => planner.moveQueueItem(item.appId, 1)} icon={<ArrowDown size={12} />} />
          <MiniIcon label={t("planner.launch")} onClick={() => onLaunch(item.appId)} icon={<Play size={12} />} />
          <QueueStatusButton status="skipped" appId={item.appId} />
          <QueueStatusButton status="completed" appId={item.appId} />
          <QueueStatusButton status="deferred" appId={item.appId} />
          <MiniIcon label={t("planner.queue.remove")} onClick={() => planner.removeFromQueue(item.appId)} icon={<Trash size={12} />} />
        </div>
      </div>)}
    </div> : <div className="py-16 text-center text-sm text-repressurizer-text-faint">{t("planner.queue.empty")}</div>}
    {planner.recentQueues.length > 0 && <div className="mt-6 border-t border-repressurizer-border-subtle pt-4">
      <p className="mb-2 text-xs font-medium text-repressurizer-text-muted">{t("planner.queue.recent")}</p>
      <div className="flex flex-wrap gap-2">{planner.recentQueues.slice(0, 5).map((queue) => <button key={queue.id} onClick={() => planner.resumeQueue(queue.id)} className="rounded-lg border border-repressurizer-border px-2.5 py-1.5 text-xs text-repressurizer-text-muted">{queue.name} · {queue.items.length}</button>)}</div>
    </div>}
  </div>;
}

function HistoryPanel() { const t = useT(); const history = useSessionPlannerStore((state) => state.history); const games = useGameStore((state) => state.games); return <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{history.length ? <div className="space-y-2">{history.slice(0,100).map((entry) => <div key={entry.id} className="flex items-center justify-between rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/50 px-3 py-2"><div><p className="text-xs text-repressurizer-text">{games[entry.appId]?.name ?? `App ${entry.appId}`}</p><p className="text-[10px] text-repressurizer-text-faint">{t(`planner.history.${entry.action}` as TranslationKey)} · {entry.durationMinutes}m</p></div><time className="text-[10px] text-repressurizer-text-faint">{new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(entry.at)}</time></div>)}</div> : <p className="py-16 text-center text-sm text-repressurizer-text-faint">{t("planner.history.empty")}</p>}</div>; }

function CollectionPreview({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) { const t = useT(); const queue = useSessionPlannerStore((state) => state.queue); return <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><section role="alertdialog" aria-label={t("planner.queue.collectionPreview")} className="w-full max-w-md rounded-xl border border-repressurizer-border bg-repressurizer-surface p-5"><h3 className="text-base font-semibold text-white">{t("planner.queue.collectionPreview")}</h3><p className="mt-2 text-sm text-repressurizer-text-muted">{t("planner.queue.collectionPreview.description", { count: queue.length })}</p><p className="mt-2 text-xs text-repressurizer-text-faint">{t("planner.queue.collectionPreview.unsaved")}</p><div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} className="rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted">{t("common.cancel")}</button><button onClick={onConfirm} className="rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white">{t("planner.queue.collectionPreview.confirm")}</button></div></section></div>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-repressurizer-text-faint">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 py-2 text-xs text-repressurizer-text">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center justify-between gap-2 text-xs text-repressurizer-text-muted"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-repressurizer-accent" /></label>; }
function TextRequirement({ label, value, required, onValue, onRequired }: { label: string; value: string; required: boolean; onValue: (value: string) => void; onRequired: (value: boolean) => void }) { const t = useT(); return <label className="space-y-1"><span className="text-[10px] text-repressurizer-text-faint">{label}</span><div className="flex gap-1"><input value={value} onChange={(event) => onValue(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5 text-xs text-repressurizer-text" /><button type="button" onClick={() => onRequired(!required)} className={`rounded-lg border px-2 text-[9px] ${required ? "border-repressurizer-accent text-repressurizer-accent" : "border-repressurizer-border text-repressurizer-text-faint"}`}>{t(required ? "planner.hard" : "planner.preference")}</button></div></label>; }
function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) { return <label className="space-y-1"><span className="text-[10px] text-repressurizer-text-faint">{label}</span><input type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5 text-xs text-repressurizer-text" /></label>; }
function RangeRequirement({ label, min, max, required, onMin, onMax, onRequired }: { label: string; min: number | null; max: number | null; required: boolean; onMin: (value: number | null) => void; onMax: (value: number | null) => void; onRequired: (value: boolean) => void }) { const t = useT(); return <div className="space-y-1"><span className="text-[10px] text-repressurizer-text-faint">{label}</span><div className="flex gap-1"><input aria-label={`${label} min`} type="number" value={min ?? ""} onChange={(event) => onMin(event.target.value === "" ? null : Number(event.target.value))} placeholder="min" className="w-16 min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5 text-xs text-repressurizer-text" /><input aria-label={`${label} max`} type="number" value={max ?? ""} onChange={(event) => onMax(event.target.value === "" ? null : Number(event.target.value))} placeholder="max" className="w-16 min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5 text-xs text-repressurizer-text" /><button type="button" onClick={() => onRequired(!required)} className={`rounded-lg border px-2 text-[9px] ${required ? "border-repressurizer-accent text-repressurizer-accent" : "border-repressurizer-border text-repressurizer-text-faint"}`}>{t(required ? "planner.hard" : "planner.preference")}</button></div></div>; }
function MiniAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) { return <button onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-repressurizer-border px-2 py-1 text-[10px] text-repressurizer-text-muted hover:text-white">{icon}{label}</button>; }
function TextAction({ label, onClick }: { label: string; onClick: () => void }) { return <button onClick={onClick} className="rounded px-1.5 py-0.5 text-[9px] text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-white">{label}</button>; }
function MiniIcon({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) { return <button aria-label={label} title={label} onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded-md border border-repressurizer-border text-repressurizer-text-muted hover:text-white">{icon}</button>; }
function QueueStatusButton({ status, appId }: { status: TonightQueueItemStatus; appId: number }) { const t = useT(); const planner = useSessionPlannerStore(); const icons = { skipped: <Minus size={12} />, completed: <Check size={12} />, deferred: <Clock size={12} />, pending: <ListChecks size={12} /> }; return <MiniIcon label={t(`planner.queue.${status}` as TranslationKey)} icon={icons[status]} onClick={() => planner.setQueueStatus(appId, status)} />; }
