import { useEffect, useMemo, useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  ChartBar,
  ChartDonut,
  DownloadSimple,
  HardDrives,
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
import type { StorageLibrary } from "../../lib/types";
import {
  serializeStorageExport,
  storageExportExtension,
  type StorageExportFormat,
} from "../../lib/storageExport";

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
  const [exportFormat, setExportFormat] = useState<StorageExportFormat>("json");
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
          const summary = achievements[install.appid];
          const estimate = hltb[install.appid]?.main_story;
          const playedHours = (game?.playtime_forever ?? 0) / 60;
          const protection = storage.protections[install.appid];
          return [
            {
              appid: install.appid,
              name: game?.name ?? `App ${install.appid}`,
              playtimeMinutes: game?.playtime_forever ?? 0,
              lastPlayed: game?.rtime_last_played ?? 0,
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
  const exportReport = async () => {
    const extension = storageExportExtension(exportFormat);
    const scopeLabel = selectedLibrary?.drive ?? t("storage.allLibraries");
    const filenameScope = selectedLibrary?.drive.replace(/[^a-z0-9]/gi, "") || "all-libraries";
    const path = await save({
      defaultPath: `repressurizer-storage-${filenameScope}.${extension}`,
      filters: [{
        name: exportFormat === "markdown" ? "Markdown" : exportFormat.toUpperCase(),
        extensions: [extension],
      }],
    });
    if (!path) return;
    await writeTextFile(
      path,
      serializeStorageExport({
        generatedAt: Date.now(),
        libraries: selectedLibrary ? [selectedLibrary] : libraries,
        games: candidates,
        selectedAppIds: selected,
        scopeLabel,
        goalBytes: goal,
        reclaimBytes: reclaim,
      }, exportFormat),
    );
    toast.getState().success(t("storage.export.reportDone"));
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
                  value={bytes(storageUsed(candidates.map((game) => game.install)))}
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
                  games={candidates}
                  libraries={selectedLibrary ? [selectedLibrary] : libraries}
                  selected={selected}
                  onToggle={(appId) => storage.toggleUninstall(appId)}
                />
              )}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-repressurizer-border px-4 py-3">
              <p className="text-[10px] text-repressurizer-text-faint">
                <ShieldCheck size={12} className="mr-1 inline" />
                {t("storage.simulationOnly")}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  onClick={() => storage.clearList()}
                  disabled={!selected.size}
                  className="rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted"
                >
                  {t("storage.clear")}
                </button>
                <SelectMenu
                  value={exportFormat}
                  onChange={(value) => setExportFormat(value as StorageExportFormat)}
                  options={[
                    { value: "json", label: "JSON", description: t("storage.export.json") },
                    { value: "csv", label: "CSV", description: t("storage.export.csv") },
                    { value: "markdown", label: "Markdown", description: t("storage.export.markdown") },
                    { value: "txt", label: t("storage.export.txt"), description: t("storage.export.txtDescription") },
                  ]}
                  ariaLabel={t("storage.export.format")}
                  size="sm"
                  align="right"
                  className="w-32"
                />
                <button
                  onClick={() => void exportReport()}
                  className="inline-flex items-center gap-1 rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white"
                >
                  <DownloadSimple size={13} />
                  {t("storage.export.report")}
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
  games,
  libraries,
  selected,
  onToggle,
}: {
  view: Exclude<StorageView, "list">;
  games: StoragePlannerGame[];
  libraries: StorageLibrary[];
  selected: Set<number>;
  onToggle: (appId: number) => void;
}) {
  const t = useT();
  const items = games;
  const total = Math.max(
    items.reduce((sum, item) => sum + item.install.totalBytes, 0),
    1,
  );
  if (view === "treemap")
    return (
      <div
        data-testid="storage-treemap"
        className="space-y-3"
      >
        {visualLibraries(libraries, items).filter((library) => library.games.length > 0).map((library) => (
          <DiskTreemap
            key={library.path}
            library={library}
            selected={selected}
            onToggle={onToggle}
          />
        ))}
      </div>
    );
  if (view === "bars")
    return (
      <div data-testid="storage-bars" className="space-y-5">
        {visualLibraries(libraries, items).map((library) => (
          <DiskBars
            key={library.path}
            library={library}
            selected={selected}
            onToggle={onToggle}
          />
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
  const otherGames = items.slice(8);
  const otherTotal = otherGames.reduce(
    (sum, game) => sum + game.install.totalBytes,
    0,
  );
  if (otherTotal > 0) segments.push(`#3f3f46 ${cursor}% 100%`);
  return (
    <div
      data-testid="storage-pie"
      className="grid items-center gap-6 py-4 sm:grid-cols-[minmax(220px,0.8fr)_1.2fr]"
    >
      <div className="relative mx-auto aspect-square w-full max-w-72">
        <div
          className="absolute inset-0 rounded-full shadow-inner"
          style={{ background: `conic-gradient(${segments.join(",")})` }}
        />
        <div className="absolute inset-[28%] flex flex-col items-center justify-center rounded-full border border-repressurizer-border bg-repressurizer-bg text-center shadow-lg">
          <strong className="text-sm text-white">{bytes(total)}</strong>
          <span className="text-[9px] uppercase text-repressurizer-text-faint">
            {t("storage.steamGames")}
          </span>
        </div>
      </div>
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
        {otherTotal > 0 && (
          <div
            data-testid="storage-pie-other"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5"
            title={otherGames.map((game) => game.name).join(", ")}
          >
            <span className="h-2.5 w-2.5 rounded-sm bg-zinc-600" />
            <span className="min-w-0 flex-1 truncate text-xs text-repressurizer-text">
              {t("storage.otherGames", { count: otherGames.length })}
            </span>
            <span className="font-mono text-[10px] text-repressurizer-text-muted">
              {bytes(otherTotal)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

type VisualGame = StoragePlannerGame;
type VisualLibrary = StorageLibrary & { games: VisualGame[] };

function visualLibraries(
  libraries: StorageLibrary[],
  games: VisualGame[],
): VisualLibrary[] {
  if (!libraries.length) {
    const installed = games.reduce(
      (sum, game) => sum + game.install.totalBytes,
      0,
    );
    return [{
      path: "unknown",
      drive: "Steam",
      totalBytes: installed,
      freeBytes: 0,
      games,
    }];
  }
  return libraries.map((library) => ({
    ...library,
    games: games
      .filter((game) => game.install.libraryPath === library.path)
      .sort((left, right) => right.install.totalBytes - left.install.totalBytes),
  }));
}

type TreemapNode = {
  id: string;
  label: string;
  value: number;
  color: string;
  game?: VisualGame;
};
type TreemapRect = TreemapNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

function binaryTreemap(
  nodes: TreemapNode[],
  x = 0,
  y = 0,
  width = 100,
  height = 100,
): TreemapRect[] {
  if (!nodes.length) return [];
  if (nodes.length === 1) return [{ ...nodes[0], x, y, width, height }];
  const total = nodes.reduce((sum, node) => sum + node.value, 0);
  let leftTotal = 0;
  let split = 1;
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const next = leftTotal + nodes[index].value;
    if (Math.abs(total / 2 - next) <= Math.abs(total / 2 - leftTotal)) {
      leftTotal = next;
      split = index + 1;
    } else break;
  }
  const ratio = Math.min(0.96, Math.max(0.04, leftTotal / total));
  if (width >= height) {
    return [
      ...binaryTreemap(nodes.slice(0, split), x, y, width * ratio, height),
      ...binaryTreemap(
        nodes.slice(split),
        x + width * ratio,
        y,
        width * (1 - ratio),
        height,
      ),
    ];
  }
  return [
    ...binaryTreemap(nodes.slice(0, split), x, y, width, height * ratio),
    ...binaryTreemap(
      nodes.slice(split),
      x,
      y + height * ratio,
      width,
      height * (1 - ratio),
    ),
  ];
}

const treemapColors = [
  "#047857",
  "#0369a1",
  "#7e22ce",
  "#b45309",
  "#be123c",
  "#0e7490",
  "#4d7c0f",
  "#c2410c",
];

function libraryNodes(library: VisualLibrary): TreemapNode[] {
  return library.games.map((game) => ({
      id: String(game.appid),
      label: game.name,
      value: game.install.totalBytes,
      color: treemapColors[game.appid % treemapColors.length],
      game,
    })).filter((node) => node.value > 0)
    .sort((left, right) => right.value - left.value);
}

function DiskTreemap({
  library,
  selected,
  onToggle,
}: {
  library: VisualLibrary;
  selected: Set<number>;
  onToggle: (appId: number) => void;
}) {
  const t = useT();
  const installed = library.games.reduce(
    (sum, game) => sum + game.install.totalBytes,
    0,
  );
  const rects = binaryTreemap(libraryNodes(library));
  return (
    <section
      className="flex h-[min(46vh,430px)] min-h-64 min-w-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black"
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.05] px-3 py-2 text-[10px]">
        <span className="min-w-0">
          <strong className="block truncate text-xs text-zinc-100">{library.drive}</strong>
          <span className="block truncate font-mono text-[9px] text-zinc-600">{library.path}</span>
        </span>
        <span className="shrink-0 font-mono text-zinc-500">
          {bytes(installed)} {t("storage.steamGames")} · {bytes(library.freeBytes)} {t("storage.free")}
        </span>
      </header>
      <div className="relative min-h-0 flex-1">
        {rects.map((rect) => {
          const game = rect.game!;
          const active = selected.has(game.appid);
          const labelFits = rect.width > 12 && rect.height > 10;
          const style = {
            left: `${rect.x}%`,
            top: `${rect.y}%`,
            width: `${rect.width}%`,
            height: `${rect.height}%`,
            backgroundColor: rect.color,
          };
          return (
            <button
              key={rect.id}
              type="button"
              title={[
                `${game.name} · ${bytes(rect.value)} · ${library.drive}`,
                `${t("storage.content.game")}: ${bytes(game.install.gameBytes)}`,
                `${t("storage.content.workshop")}: ${bytes(game.install.workshopBytes)}`,
                `${t("storage.content.shader")}: ${bytes(game.install.shaderCacheBytes)}`,
                `${t("storage.content.compat")}: ${bytes(game.install.compatdataBytes)}`,
              ].join("\n")}
              aria-label={`${t("storage.addList")} ${game.name}`}
              aria-pressed={active}
              onClick={() => onToggle(game.appid)}
              style={style}
              className={`group absolute overflow-hidden border border-black/70 text-left outline-none transition-[filter,box-shadow] hover:z-10 hover:brightness-125 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-repressurizer-accent ${active ? "z-10 ring-2 ring-inset ring-repressurizer-accent" : ""}`}
            >
              <GameContentTreemap game={game} color={rect.color} />
              {labelFits && (
                <span className="pointer-events-none absolute inset-x-1 top-1 z-10 overflow-hidden text-[9px] leading-tight text-white drop-shadow-[0_1px_2px_#000]">
                  <strong className="block truncate font-semibold">{game.name}</strong>
                  <span className="text-white/75">{bytes(rect.value)}</span>
                </span>
              )}
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/25" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GameContentTreemap({
  game,
  color,
}: {
  game: VisualGame;
  color: string;
}) {
  const t = useT();
  const parts = [
    { id: "game", label: t("storage.content.game"), value: game.install.gameBytes, opacity: 1 },
    { id: "workshop", label: t("storage.content.workshop"), value: game.install.workshopBytes, opacity: 0.8 },
    { id: "shader", label: t("storage.content.shader"), value: game.install.shaderCacheBytes, opacity: 0.62 },
    { id: "compat", label: t("storage.content.compat"), value: game.install.compatdataBytes, opacity: 0.45 },
  ].filter((part) => part.value > 0);
  const rects = binaryTreemap(parts.map((part) => ({
    ...part,
    color,
  })));
  return (
    <span className="absolute inset-0">
      {rects.map((rect) => (
        <span
          key={rect.id}
          title={`${rect.label} · ${bytes(rect.value)}`}
          style={{
            left: `${rect.x}%`,
            top: `${rect.y}%`,
            width: `${rect.width}%`,
            height: `${rect.height}%`,
            backgroundColor: color,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.22) 1px, transparent 1px)",
            backgroundSize: "14px 14px",
            opacity: parts.find((part) => part.id === rect.id)?.opacity ?? 1,
          }}
          className="absolute border border-black/25 shadow-[inset_0_0_12px_rgba(255,255,255,0.08)]"
        />
      ))}
    </span>
  );
}

function DiskBars({
  library,
  selected,
  onToggle,
}: {
  library: VisualLibrary;
  selected: Set<number>;
  onToggle: (appId: number) => void;
}) {
  const t = useT();
  const capacity = Math.max(1, library.totalBytes);
  const installed = library.games.reduce(
    (sum, game) => sum + game.install.totalBytes,
    0,
  );
  const otherUsed = Math.max(0, capacity - library.freeBytes - installed);
  const percent = (value: number) => (value / capacity) * 100;
  return (
    <section className="border-t border-repressurizer-border-subtle pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-xs text-white">{library.drive}</strong>
        <span className="font-mono text-[10px] text-repressurizer-text-faint">
          {bytes(capacity)} {t("storage.capacity")} · {bytes(library.freeBytes)} {t("storage.free")}
        </span>
      </div>
      <div className="mb-3 flex h-8 overflow-hidden rounded-md border border-repressurizer-border bg-repressurizer-bg" title={`${bytes(capacity)} ${t("storage.capacity")}`}>
        <span
          style={{ width: `${percent(installed)}%` }}
          className="flex items-center justify-center overflow-hidden bg-repressurizer-accent/70 text-[9px] text-white"
          title={`${t("storage.steamGames")} · ${bytes(installed)}`}
        >
          {percent(installed) >= 12 ? `${t("storage.steamGames")} · ${bytes(installed)}` : ""}
        </span>
        <span
          style={{ width: `${percent(otherUsed)}%` }}
          className="flex items-center justify-center overflow-hidden bg-zinc-600/70 text-[9px] text-zinc-200"
          title={`${t("storage.otherData")} · ${bytes(otherUsed)}`}
        >
          {percent(otherUsed) >= 12 ? `${t("storage.otherData")} · ${bytes(otherUsed)}` : ""}
        </span>
        <span
          style={{ width: `${percent(library.freeBytes)}%` }}
          className="flex items-center justify-center overflow-hidden bg-sky-950/65 text-[9px] text-sky-200"
          title={`${t("storage.freeSpace")} · ${bytes(library.freeBytes)}`}
        >
          {percent(library.freeBytes) >= 12 ? `${t("storage.freeSpace")} · ${bytes(library.freeBytes)}` : ""}
        </span>
      </div>
      <div className="space-y-1.5">
        {library.games.map((game) => {
          const share = percent(game.install.totalBytes);
          return (
            <button
              key={game.appid}
              type="button"
              onClick={() => onToggle(game.appid)}
              aria-pressed={selected.has(game.appid)}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded px-1 py-1 text-left hover:bg-white/[0.03] sm:grid-cols-[minmax(100px,220px)_minmax(120px,1fr)_7rem] ${selected.has(game.appid) ? "bg-repressurizer-accent/[0.07]" : ""}`}
            >
              <span className="truncate text-xs text-repressurizer-text">
                {game.name}
              </span>
              <span className="relative col-span-2 row-start-2 h-4 overflow-hidden rounded-sm bg-repressurizer-bg ring-1 ring-inset ring-white/5 sm:col-span-1 sm:row-start-auto">
                <span
                  data-testid={`storage-disk-share-${game.appid}`}
                  data-share={share.toFixed(4)}
                  style={{ width: `${share}%`, minWidth: share > 0 ? 2 : 0 }}
                  className={`block h-full ${selected.has(game.appid) ? "bg-repressurizer-accent" : "bg-sky-500/65"}`}
                />
              </span>
              <span className="col-start-2 row-start-1 text-right font-mono text-[10px] text-repressurizer-text-muted sm:col-start-auto sm:row-start-auto">
                {bytes(game.install.totalBytes)} · {share.toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
