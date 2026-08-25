import { useEffect, useMemo, useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  ChartBar,
  ChartDonut,
  DownloadSimple,
  HardDrives,
  Info,
  ListBullets,
  ShieldCheck,
  SquaresFour,
  X,
} from "@phosphor-icons/react";
import {
  rankStorageCandidates,
  simulateReclaim,
  storageUsed,
  targetBytes,
  type StoragePlannerGame,
  type StorageProtection,
} from "../../lib/storagePlanner";
import { useGameStore } from "../../stores/gameStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useStatusStore } from "../../stores/statusStore";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useStoragePlannerStore } from "../../stores/storagePlannerStore";
import { useToastStore } from "../../stores/toastStore";
import { useT, type TranslationKey } from "../../lib/i18n";
import { detectSteam } from "../../lib/tauri";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";
import { SelectMenu } from "../ui/SelectMenu";
import { Tooltip } from "../ui/Tooltip";
import { SteamImage } from "../games/SteamImage";

const GB = 1_073_741_824;
const bytes = (value: number) =>
  value >= GB
    ? `${(value / GB).toFixed(1)} GB`
    : `${(value / 1_048_576).toFixed(0)} MB`;
type StorageView = "list" | "treemap" | "bars" | "pie";

export function StoragePlanner({ onClose }: { onClose: () => void }) {
  const t = useT();
  const storage = useStoragePlannerStore();
  const steamPath = useSettingsStore((state) => state.steamPath);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const games = useGameStore((state) => state.games);
  const details = useGameStore((state) => state.details);
  const statuses = useStatusStore((state) => state.statuses);
  const achievements = useAchievementsStore((state) => state.summaries);
  const hltb = useHltbStore((state) => state.data);
  const toast = useToastStore;
  const [goalMode, setGoalMode] = useState<"bytes" | "free-percent">("bytes");
  const [goalGb, setGoalGb] = useState(50);
  const [freePercent, setFreePercent] = useState(20);
  const [libraryPath, setLibraryPath] = useState("");
  const [view, setView] = useState<StorageView>("list");
  const refreshSmart = async () => {
    try {
      if (!steamPath.trim()) throw new Error("Steam path is empty");
      await storage.refresh(steamPath);
    } catch (initialError) {
      try {
        const detected = await detectSteam();
        setSettings({ steamPath: detected.steam_path });
        await storage.refresh(detected.steam_path);
      } catch {
        throw initialError;
      }
    }
  };
  useEffect(() => {
    if (!storage.hydrated) void storage.hydrate();
    if (!storage.inventory && !storage.loading)
      void refreshSmart().catch(() => {});
  }, [storage.hydrated, storage.inventory]); // eslint-disable-line react-hooks/exhaustive-deps
  const libraries = storage.inventory?.libraries ?? [];
  const selectedLibrary = libraryPath
    ? (libraries.find((item) => item.path === libraryPath) ?? null)
    : null;
  const goalLibrary =
    selectedLibrary ??
    (libraries.length
      ? {
          path: "",
          drive: t("storage.allLibraries"),
          totalBytes: libraries.reduce((sum, item) => sum + item.totalBytes, 0),
          freeBytes: libraries.reduce((sum, item) => sum + item.freeBytes, 0),
        }
      : null);
  const candidates = useMemo(
    () =>
      (storage.inventory?.installs ?? [])
        .filter(
          (install) =>
            !selectedLibrary || install.libraryPath === selectedLibrary.path,
        )
        .flatMap((install): StoragePlannerGame[] => {
          const game = games[install.appid];
          if (!game) return [];
          const summary = achievements[install.appid];
          const estimate = hltb[install.appid]?.main_story;
          const playedHours = game.playtime_forever / 60;
          const protection = storage.protections[install.appid];
          return [
            {
              appid: install.appid,
              name: game.name,
              playtimeMinutes: game.playtime_forever,
              lastPlayed: game.rtime_last_played,
              status: statuses[install.appid] ?? "none",
              achievementPercent: summary?.total
                ? Math.round((summary.achieved / summary.total) * 100)
                : null,
              remainingHours:
                typeof estimate === "number"
                  ? Math.max(0, estimate - playedHours)
                  : null,
              deckCompatible: details[install.appid]?.platforms?.linux
                ? true
                : null,
              install,
              protection: protection?.kind ?? null,
              protectedUntil: protection?.until ?? null,
              hasUnsyncedSaves: null,
            },
          ];
        }),
    [
      achievements,
      details,
      games,
      hltb,
      selectedLibrary,
      statuses,
      storage.inventory,
      storage.protections,
    ],
  );
  const suggestions = useMemo(
    () => rankStorageCandidates(candidates),
    [candidates],
  );
  const selected = new Set(storage.uninstallList);
  const reclaim = simulateReclaim(selected, suggestions);
  const goal = targetBytes({
    mode: goalMode,
    bytes: goalGb * GB,
    freePercent,
    library: goalLibrary,
  });
  const exportList = async () => {
    const path = await save({
      defaultPath: "repressurizer-uninstall-plan.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    const items = suggestions
      .filter((item) => selected.has(item.appid))
      .map((item) => ({
        appId: item.appid,
        name: item.name,
        reclaimBytes: item.install.totalBytes,
        library: item.install.libraryPath,
        reasons: item.reasons,
        limitations: item.limitations,
      }));
    await writeTextFile(
      path,
      JSON.stringify(
        {
          exportedAt: Date.now(),
          goalBytes: goal,
          reclaimBytes: reclaim,
          items,
        },
        null,
        2,
      ),
    );
    toast.getState().success(t("storage.exported"));
  };
  return (
    <DialogOverlay
      label={t("storage.title")}
      onClose={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md"
    >
      <ResizableDialogPanel
        dialogId="storage-planner"
        defaultSize={{ width: 1120, height: 780 }}
        minSize={{ width: 680, height: 520 }}
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog"
      >
        {({ sizeControls }) => (
          <>
            <header className="flex items-start justify-between border-b border-repressurizer-border px-4 py-3">
              <div className="flex gap-2.5">
                <HardDrives size={20} className="text-repressurizer-accent" />
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {t("storage.title")}
                  </h2>
                  <p className="text-xs text-repressurizer-text-faint">
                    {t("storage.description")}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                {sizeControls}
                <button
                  aria-label={t("common.close")}
                  onClick={onClose}
                  className="p-1.5 text-repressurizer-text-muted"
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex flex-wrap items-end gap-3 border-b border-repressurizer-border-subtle pb-4">
                <SelectMenu
                  value={selectedLibrary?.path ?? ""}
                  onChange={setLibraryPath}
                  options={[
                    {
                      value: "",
                      label: `${t("storage.allLibraries")} · ${libraries.length}`,
                    },
                    ...libraries.map((item) => ({
                      value: item.path,
                      label: `${item.drive} · ${bytes(item.freeBytes)} ${t("storage.free")}`,
                      description: item.path,
                    })),
                  ]}
                  label={t("storage.library")}
                  ariaLabel={t("storage.library")}
                  className="w-72 max-w-full"
                />
                <SelectMenu
                  value={goalMode}
                  onChange={(value) => setGoalMode(value as typeof goalMode)}
                  options={[
                    { value: "bytes", label: t("storage.goal.bytes") },
                    { value: "free-percent", label: t("storage.goal.percent") },
                  ]}
                  label={t("storage.goal")}
                  ariaLabel={t("storage.goal")}
                  className="w-44"
                />
                {goalMode === "bytes" ? (
                  <NumberInput
                    value={goalGb}
                    onChange={setGoalGb}
                    suffix="GB"
                  />
                ) : (
                  <NumberInput
                    value={freePercent}
                    onChange={setFreePercent}
                    suffix="%"
                  />
                )}
                <button
                  onClick={() =>
                    void refreshSmart().catch((error) =>
                      toast.getState().error(String(error)),
                    )
                  }
                  disabled={storage.loading}
                  className="rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted"
                >
                  {storage.loading
                    ? t("storage.scanning")
                    : t("storage.rescan")}
                </button>
                <ViewSwitcher value={view} onChange={setView} />
              </div>
              <div className="grid grid-cols-2 gap-3 py-4 sm:grid-cols-4">
                <Metric
                  label={t("storage.used")}
                  value={bytes(storageUsed(storage.inventory?.installs ?? []))}
                />
                <Metric label={t("storage.goal")} value={bytes(goal)} />
                <Metric
                  label={t("storage.simulated")}
                  value={bytes(reclaim)}
                  accent={reclaim >= goal && goal > 0}
                />
                <Metric
                  label={t("storage.selected")}
                  value={String(selected.size)}
                />
              </div>
              {storage.error && (
                <p className="mb-3 text-xs text-repressurizer-danger">
                  {storage.error}
                </p>
              )}
              <p className="mb-3 flex items-center gap-1.5 text-[10px] text-amber-300">
                <Info size={12} />
                {t("storage.safetyNotice")}
              </p>
              {view === "list" ? (
                <div className="space-y-2">
                  {suggestions.map((game) => (
                    <StorageRow
                      key={game.appid}
                      game={game}
                      selected={selected.has(game.appid)}
                      onToggle={() => storage.toggleUninstall(game.appid)}
                      onProtect={(value) => storage.protect(game.appid, value)}
                    />
                  ))}
                </div>
              ) : (
                <StorageVisualization
                  view={view}
                  suggestions={suggestions}
                  selected={selected}
                  onToggle={(appId) => storage.toggleUninstall(appId)}
                />
              )}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-repressurizer-border px-4 py-3">
              <p className="text-[10px] text-repressurizer-text-faint">
                <ShieldCheck size={12} className="mr-1 inline" />
                {t("storage.noDelete")}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => storage.clearList()}
                  className="rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted"
                >
                  {t("storage.clear")}
                </button>
                <button
                  onClick={() => void exportList()}
                  disabled={!selected.size}
                  className="inline-flex items-center gap-1 rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  <DownloadSimple size={13} />
                  {t("storage.export")}
                </button>
              </div>
            </footer>
          </>
        )}
      </ResizableDialogPanel>
    </DialogOverlay>
  );
}
function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase text-repressurizer-text-faint">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold ${accent ? "text-repressurizer-accent" : "text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}
function NumberInput({
  value,
  onChange,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  suffix: string;
}) {
  return (
    <label className="flex items-center rounded-lg border border-repressurizer-border bg-repressurizer-bg">
      <input
        aria-label={suffix}
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-20 bg-transparent px-3 py-2 text-xs text-repressurizer-text"
      />
      <span className="pr-3 text-[10px] text-repressurizer-text-faint">
        {suffix}
      </span>
    </label>
  );
}
function ViewSwitcher({
  value,
  onChange,
}: {
  value: StorageView;
  onChange: (value: StorageView) => void;
}) {
  const t = useT();
  const views: Array<{ id: StorageView; icon: React.ReactNode }> = [
    { id: "list", icon: <ListBullets size={15} /> },
    { id: "treemap", icon: <SquaresFour size={15} /> },
    { id: "bars", icon: <ChartBar size={15} /> },
    { id: "pie", icon: <ChartDonut size={15} /> },
  ];
  return (
    <div className="ml-auto flex rounded-lg border border-repressurizer-border bg-repressurizer-bg p-0.5">
      {views.map((item) => {
        const label = t(`storage.view.${item.id}` as TranslationKey);
        return (
          <Tooltip key={item.id} content={label}>
            <button
              type="button"
              aria-label={label}
              aria-pressed={value === item.id}
              onClick={() => onChange(item.id)}
              className={`flex h-8 w-8 items-center justify-center rounded-md ${value === item.id ? "bg-repressurizer-accent/15 text-repressurizer-accent" : "text-repressurizer-text-faint hover:text-white"}`}
            >
              {item.icon}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
function StorageRow({
  game,
  selected,
  onToggle,
  onProtect,
}: {
  game: ReturnType<typeof rankStorageCandidates>[number];
  selected: boolean;
  onToggle: () => void;
  onProtect: (value: StorageProtection | null) => void;
}) {
  const t = useT();
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border border-repressurizer-border-subtle p-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
      <input
        aria-label={`${t("storage.addList")} ${game.name}`}
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="truncate text-sm font-medium text-white">
            {game.name}
          </h3>
          <span className="text-xs font-semibold text-repressurizer-accent">
            {bytes(game.install.totalBytes)}
          </span>
          <span className="text-[10px] text-repressurizer-text-faint">
            {game.install.libraryPath}
          </span>
        </div>
        <p className="mt-1 text-xs text-repressurizer-text-muted">
          {game.reasons.join(" · ")}
        </p>
        <p className="mt-1 text-[10px] text-amber-300">
          {game.limitations.join(" · ")}
        </p>
        <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-repressurizer-text-faint">
          <span>{(game.playtimeMinutes / 60).toFixed(1)}h</span>
          <span>{game.status}</span>
          <span>
            {game.achievementPercent === null
              ? "Achievements —"
              : `Achievements ${game.achievementPercent}%`}
          </span>
          <span>
            {game.remainingHours === null
              ? "Remaining —"
              : `~${game.remainingHours.toFixed(1)}h remaining`}
          </span>
          <span>
            {new Date(game.install.scannedAt * 1000).toLocaleString()}
          </span>
        </div>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 md:col-start-auto">
        <SelectMenu
          value={game.protection ?? ""}
          onChange={(value) =>
            onProtect((value || null) as StorageProtection | null)
          }
          options={[
            { value: "", label: t("storage.protect.none") },
            { value: "keep", label: t("storage.protect.keep") },
            { value: "30-days", label: t("storage.protect.30") },
            { value: "never", label: t("storage.protect.never") },
          ]}
          ariaLabel={`${t("storage.protect")} ${game.name}`}
          size="sm"
          className="w-36"
        />
        <button
          onClick={() =>
            void openExternal(`steam://nav/games/details/${game.appid}`)
          }
          className="rounded-lg border border-repressurizer-border px-2 py-1.5 text-[10px] text-repressurizer-text-muted"
        >
          {t("storage.openSteam")}
        </button>
      </div>
    </article>
  );
}
function StorageVisualization({
  view,
  suggestions,
  selected,
  onToggle,
}: {
  view: Exclude<StorageView, "list">;
  suggestions: ReturnType<typeof rankStorageCandidates>;
  selected: Set<number>;
  onToggle: (appId: number) => void;
}) {
  const t = useT();
  const items = suggestions.slice(0, 16);
  const max = Math.max(...items.map((item) => item.install.totalBytes), 1);
  const total = Math.max(
    items.reduce((sum, item) => sum + item.install.totalBytes, 0),
    1,
  );
  if (view === "treemap")
    return (
      <div
        data-testid="storage-treemap"
        className="flex min-h-80 flex-wrap content-start gap-2 overflow-hidden rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/35 p-2"
      >
        {items.map((game) => (
          <button
            key={game.appid}
            onClick={() => onToggle(game.appid)}
            aria-pressed={selected.has(game.appid)}
            aria-label={`${t("storage.addList")} ${game.name}`}
            style={{
              flexGrow: Math.max(1, (game.install.totalBytes / total) * 100),
              flexBasis: `${Math.max(16, (game.install.totalBytes / max) * 38)}%`,
            }}
            className={`group relative min-h-24 overflow-hidden rounded-lg border text-left ${selected.has(game.appid) ? "border-repressurizer-accent" : "border-repressurizer-border-subtle"}`}
          >
            <SteamImage
              appId={game.appid}
              alt=""
              kind="header"
              className="absolute inset-0 h-full w-full object-cover opacity-55 transition-transform group-hover:scale-105"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
            <span className="absolute inset-x-3 bottom-2">
              <strong className="block truncate text-xs text-white">
                {game.name}
              </strong>
              <span className="text-[10px] text-repressurizer-accent">
                {bytes(game.install.totalBytes)}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  if (view === "bars")
    return (
      <div data-testid="storage-bars" className="space-y-2">
        {items.map((game) => (
          <button
            key={game.appid}
            onClick={() => onToggle(game.appid)}
            aria-pressed={selected.has(game.appid)}
            className="grid w-full grid-cols-[minmax(120px,220px)_1fr_auto] items-center gap-3 text-left"
          >
            <span className="truncate text-xs text-repressurizer-text">
              {game.name}
            </span>
            <span className="h-6 overflow-hidden rounded-md bg-repressurizer-bg">
              <span
                style={{
                  width: `${Math.max(2, (game.install.totalBytes / max) * 100)}%`,
                }}
                className={`block h-full rounded-md ${selected.has(game.appid) ? "bg-repressurizer-accent" : "bg-sky-500/55"}`}
              />
            </span>
            <span className="w-16 text-right font-mono text-[10px] text-repressurizer-text-muted">
              {bytes(game.install.totalBytes)}
            </span>
          </button>
        ))}
      </div>
    );
  const colors = [
    "#10b981",
    "#38bdf8",
    "#a78bfa",
    "#f59e0b",
    "#fb7185",
    "#22d3ee",
    "#84cc16",
    "#f97316",
  ];
  let cursor = 0;
  const segments = items.slice(0, 8).map((game, index) => {
    const start = cursor;
    cursor += (game.install.totalBytes / total) * 100;
    return `${colors[index]} ${start}% ${cursor}%`;
  });
  if (cursor < 100) segments.push(`#27272a ${cursor}% 100%`);
  return (
    <div
      data-testid="storage-pie"
      className="grid items-center gap-6 py-4 sm:grid-cols-[minmax(220px,0.8fr)_1.2fr]"
    >
      <div
        className="mx-auto aspect-square w-full max-w-72 rounded-full border-[26px] border-repressurizer-surface shadow-inner"
        style={{ background: `conic-gradient(${segments.join(",")})` }}
      />
      <div className="space-y-2">
        {items.slice(0, 8).map((game, index) => (
          <button
            key={game.appid}
            onClick={() => onToggle(game.appid)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${selected.has(game.appid) ? "bg-repressurizer-accent/10" : "hover:bg-repressurizer-surface-hover"}`}
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: colors[index] }}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-repressurizer-text">
              {game.name}
            </span>
            <span className="font-mono text-[10px] text-repressurizer-text-muted">
              {bytes(game.install.totalBytes)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
