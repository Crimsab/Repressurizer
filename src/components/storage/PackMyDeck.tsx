import { useEffect, useMemo, useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  Backpack,
  CheckCircle,
  Clock,
  FloppyDisk,
  GameController,
  Lock,
  Shapes,
  ShieldCheck,
  Shuffle,
  SteamLogo,
  WarningCircle,
  WifiSlash,
  X,
  XCircle,
} from "@phosphor-icons/react";
import {
  type DeckPackCandidate,
  type DeckPackCategory,
} from "../../lib/deckPack";
import { useDeckPackStore } from "../../stores/deckPackStore";
import { useStoragePlannerStore } from "../../stores/storagePlannerStore";
import { useGameStore } from "../../stores/gameStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useToastStore } from "../../stores/toastStore";
import { useT, type TranslationKey } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";
import { SelectMenu } from "../ui/SelectMenu";
import { Tooltip } from "../ui/Tooltip";
const GB = 1_073_741_824;
const format = (value: number) => `${(value / GB).toFixed(1)} GB`;
const CATEGORIES: DeckPackCategory[] = [
  "long",
  "short",
  "roguelike",
  "multiplayer",
  "relaxing",
  "narrative",
  "difficult",
  "offline",
];
function includes(details: string[], pattern: RegExp) {
  return details.some((item) => pattern.test(item));
}

export function PackMyDeck({ onClose }: { onClose: () => void }) {
  const t = useT();
  const pack = useDeckPackStore();
  const inventory = useStoragePlannerStore((state) => state.inventory);
  const games = useGameStore((state) => state.games);
  const details = useGameStore((state) => state.details);
  const installedIds = useGameStore((state) => state.installedAppIds);
  const hltb = useHltbStore((state) => state.data);
  const [requiredId, setRequiredId] = useState("");
  const [excludedId, setExcludedId] = useState("");
  const [saveName, setSaveName] = useState("Travel pack");
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const toast = useToastStore;
  useEffect(() => {
    if (!pack.hydrated) void pack.hydrate();
  }, [pack.hydrated]);
  useEffect(() => {
    const storage = useStoragePlannerStore.getState();
    const steamPath = useSettingsStore.getState().steamPath;
    if (!storage.loading && steamPath)
      void storage.refreshIfChanged(steamPath).catch(() => {});
  }, [inventory]);
  const installed = useMemo(() => new Set(installedIds), [installedIds]);
  const sizeById = useMemo(
    () =>
      new Map(
        (inventory?.installs ?? []).map((item) => [
          item.appid,
          item.totalBytes,
        ]),
      ),
    [inventory],
  );
  const candidates = useMemo(
    (): DeckPackCandidate[] =>
      Object.values(games).map((game) => {
        const meta = details[game.appid];
        const labels = [
          ...(meta?.genres ?? []),
          ...(meta?.tags ?? []),
          ...(meta?.categories ?? []),
        ].map((item) => item.toLowerCase());
        const duration = hltb[game.appid]?.main_story ?? null;
        const categories: DeckPackCategory[] = [];
        if (duration !== null && duration >= 20) categories.push("long");
        if (duration !== null && duration <= 10) categories.push("short");
        if (includes(labels, /rogue/)) categories.push("roguelike");
        if (includes(labels, /multi|co-op/)) categories.push("multiplayer");
        if (includes(labels, /relax|cozy|casual/)) categories.push("relaxing");
        if (includes(labels, /story|narrative|adventure|rpg/))
          categories.push("narrative");
        if (includes(labels, /difficult|souls|hard/))
          categories.push("difficult");
        if (meta?.offline_support === true) categories.push("offline");
        return {
          appId: game.appid,
          name: game.name,
          sizeBytes:
            sizeById.get(game.appid) ?? meta?.estimated_install_bytes ?? null,
          installed: installed.has(game.appid),
          deckStatus: meta?.deck_status ?? "unknown",
          fullController:
            meta?.full_controller_support ??
            (includes(labels, /full controller/) ? true : null),
          externalLauncher: meta?.external_launcher ?? null,
          offline: meta?.offline_support ?? null,
          firstLaunchOnline: meta?.first_launch_online ?? null,
          durationHours: duration,
          categories,
        };
      }),
    [details, games, hltb, installed, sizeById],
  );
  const result = pack.result;
  const toggleCategory = (category: DeckPackCategory) =>
    pack.setConfig({
      wantedCategories: pack.config.wantedCategories.includes(category)
        ? pack.config.wantedCategories.filter((item) => item !== category)
        : [...pack.config.wantedCategories, category],
    });
  const generate = (reroll = false) => pack.generate(candidates, reroll);
  const createCollection = () => {
    if (!result?.items.length) return;
    useCategoryStore.getState().addCategoryWithGames(
      `Deck · ${saveName.trim() || "Travel pack"}`,
      result.items.map((item) => item.appId),
    );
    toast.getState().success(t("deck.collectionStaged"));
  };
  return (
    <DialogOverlay
      label={t("deck.title")}
      onClose={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md"
    >
      <ResizableDialogPanel
        dialogId="pack-my-deck"
        defaultSize={{ width: 1040, height: 760 }}
        minSize={{ width: 680, height: 540 }}
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog"
      >
        {({ sizeControls }) => (
          <>
            <header className="flex items-start justify-between border-b border-repressurizer-border px-4 py-3">
              <div className="flex gap-2.5">
                <Backpack size={20} className="text-repressurizer-accent" />
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {t("deck.title")}
                  </h2>
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
            <div
              className="deck-pack-layout relative grid min-h-0 flex-1 overflow-y-auto"
              style={
                {
                  "--deck-sidebar-width": `${sidebarWidth}px`,
                } as React.CSSProperties
              }
            >
              <aside className="relative border-b border-repressurizer-border-subtle p-5 lg:border-b-0 lg:border-r">
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label={t("deck.available")}
                    value={pack.config.availableBytes / GB}
                    onChange={(value) =>
                      pack.setConfig({ availableBytes: value * GB })
                    }
                  />
                  <NumberField
                    label={t("deck.margin")}
                    value={pack.config.safetyPercent}
                    onChange={(safetyPercent) =>
                      pack.setConfig({ safetyPercent })
                    }
                  />
                  <NumberField
                    label={t("deck.count")}
                    value={pack.config.gameCount}
                    onChange={(gameCount) => pack.setConfig({ gameCount })}
                  />
                  <Select
                    label={t("deck.compatibility")}
                    value={pack.config.deckFilter}
                    onChange={(deckFilter) =>
                      pack.setConfig({
                        deckFilter: deckFilter as typeof pack.config.deckFilter,
                      })
                    }
                    options={["any", "playable", "verified"]}
                  />
                </div>
                <h3 className="mt-5 text-[10px] font-semibold uppercase text-repressurizer-text-faint">
                  {t("deck.categories")}
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CATEGORIES.map((category) => (
                    <button
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={`rounded-full border px-2 py-1 text-[10px] ${pack.config.wantedCategories.includes(category) ? "border-repressurizer-accent bg-repressurizer-accent/15 text-white" : "border-repressurizer-border text-repressurizer-text-muted"}`}
                    >
                      {t(`deck.category.${category}` as TranslationKey)}
                    </button>
                  ))}
                </div>
                <div className="mt-5 grid gap-2.5 text-xs text-repressurizer-text-muted">
                  <Toggle
                    label={t("deck.controller")}
                    checked={pack.config.requireController}
                    onChange={(requireController) =>
                      pack.setConfig({ requireController })
                    }
                  />
                  <Toggle
                    label={t("deck.noLauncher")}
                    checked={pack.config.noLauncher}
                    onChange={(noLauncher) => pack.setConfig({ noLauncher })}
                  />
                  <Toggle
                    label={t("deck.offline")}
                    checked={pack.config.requireOffline}
                    onChange={(requireOffline) =>
                      pack.setConfig({ requireOffline })
                    }
                  />
                  <Select
                    label={t("deck.installation")}
                    value={pack.config.installation}
                    onChange={(installation) =>
                      pack.setConfig({
                        installation:
                          installation as typeof pack.config.installation,
                      })
                    }
                    options={["any", "installed", "not-installed"]}
                  />
                </div>
                <EntityPicker
                  label={t("deck.required")}
                  value={requiredId}
                  onChange={setRequiredId}
                  candidates={candidates.filter(
                    (item) => !pack.config.locked.includes(item.appId),
                  )}
                  onAdd={(appId) => {
                    pack.toggleLocked(appId);
                    setRequiredId("");
                  }}
                />
                <EntityPicker
                  label={t("deck.excluded")}
                  value={excludedId}
                  onChange={setExcludedId}
                  candidates={candidates.filter(
                    (item) => !pack.config.excluded.includes(item.appId),
                  )}
                  onAdd={(appId) => {
                    pack.toggleExcluded(appId);
                    setExcludedId("");
                  }}
                />
                <button
                  onClick={() => generate(false)}
                  className="mt-5 w-full rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white"
                >
                  {t("deck.build")}
                </button>
                <button
                  onClick={() => generate(true)}
                  disabled={!result}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted disabled:opacity-40"
                >
                  <Shuffle size={13} />
                  {t("deck.reroll")}
                </button>
                <div
                  role="separator"
                  aria-label={t("deck.resizeColumn")}
                  aria-orientation="vertical"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft")
                      setSidebarWidth((value) => Math.max(340, value - 16));
                    if (event.key === "ArrowRight")
                      setSidebarWidth((value) => Math.min(520, value + 16));
                  }}
                  onPointerDown={(event) =>
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }
                  onPointerMove={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId))
                      return;
                    const bounds =
                      event.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                    if (bounds)
                      setSidebarWidth(
                        Math.max(
                          340,
                          Math.min(520, event.clientX - bounds.left),
                        ),
                      );
                  }}
                  className="absolute -right-1 top-0 z-10 hidden h-full w-2 cursor-col-resize touch-none lg:block"
                >
                  <span className="absolute left-1/2 top-1/2 h-12 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-repressurizer-border transition-colors hover:bg-repressurizer-accent" />
                </div>
              </aside>
              <main className="min-w-0 p-5">
                {result ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Metric
                        label={t("deck.capacity")}
                        value={format(result.capacityBytes)}
                      />
                      <Metric
                        label={t("deck.used")}
                        value={format(result.usedBytes)}
                      />
                      <Metric
                        label={t("deck.remaining")}
                        value={format(result.remainingBytes)}
                      />
                      <Metric
                        label={t("deck.games")}
                        value={String(result.items.length)}
                        danger={result.overflowBytes > 0}
                      />
                    </div>
                    {result.limitations.length > 0 && (
                      <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2 text-[10px] text-amber-300">
                        {result.limitations.join(" · ")}
                        {result.overflowBytes > 0
                          ? ` · ${format(result.overflowBytes)} over capacity`
                          : ""}
                      </p>
                    )}
                    <div className="mt-4 space-y-2">
                      {result.items.map((item) => (
                        <article
                          key={item.appId}
                          className="grid gap-2 rounded-xl border border-repressurizer-border-subtle p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                        >
                          <span className="text-xs font-semibold text-repressurizer-accent">
                            {item.priority}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-2">
                              <h3 className="truncate text-sm text-white">
                                {item.name}
                              </h3>
                              <span className="text-xs text-repressurizer-text-muted">
                                {format(item.sizeBytes ?? 0)}
                              </span>
                            </div>
                            <ReasonIcons
                              reasons={item.reasons}
                              limitations={item.limitations}
                            />
                          </div>
                          <div className="flex items-start gap-1">
                            <IconButton
                              label={`${t("deck.lock")} ${item.name}`}
                              onClick={() => pack.toggleLocked(item.appId)}
                              active={pack.config.locked.includes(item.appId)}
                              icon={<Lock size={14} />}
                            />
                            <IconButton
                              label={`${t("deck.exclude")} ${item.name}`}
                              onClick={() => pack.toggleExcluded(item.appId)}
                              tone="danger"
                              icon={<XCircle size={14} />}
                            />
                            <IconButton
                              label={
                                item.installed
                                  ? t("deck.installed")
                                  : t("deck.installPlan")
                              }
                              onClick={() =>
                                void openExternal(
                                  `steam://nav/games/details/${item.appId}`,
                                )
                              }
                              icon={<SteamLogo size={14} />}
                            />
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="py-24 text-center text-xs text-repressurizer-text-faint">
                    {t("deck.empty")}
                  </p>
                )}
              </main>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-repressurizer-border px-4 py-3">
              <div className="flex min-w-0 flex-1 gap-2">
                <input
                  aria-label={t("deck.packName")}
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  className="min-w-0 max-w-56 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-xs text-repressurizer-text"
                />
                <button
                  onClick={() => pack.saveCurrent(saveName)}
                  disabled={!result}
                  className="inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted disabled:opacity-40"
                >
                  <FloppyDisk size={13} />
                  {t("deck.save")}
                </button>
                <SelectMenu
                  value=""
                  onChange={(id) => pack.loadSaved(id)}
                  options={[
                    { value: "", label: t("deck.saved") },
                    ...pack.saved.map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                  ]}
                  ariaLabel={t("deck.saved")}
                  size="sm"
                  className="w-44"
                />
              </div>
              <button
                onClick={createCollection}
                disabled={!result?.items.length}
                className="rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                {t("deck.collection")}
              </button>
            </footer>
          </>
        )}
      </ResizableDialogPanel>
    </DialogOverlay>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-[9px] uppercase text-repressurizer-text-faint">
      {label}
      <input
        type="number"
        min={1}
        value={globalThis.Number.isInteger(value) ? value : value.toFixed(1)}
        onChange={(event) => onChange(globalThis.Number(event.target.value))}
        className="appearance-none rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-2 text-xs normal-case text-repressurizer-text"
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <SelectMenu
      value={value}
      onChange={onChange}
      options={options.map((option) => ({ value: option, label: option }))}
      label={label}
      ariaLabel={label}
      size="sm"
    />
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
function EntityPicker({
  label,
  value,
  onChange,
  candidates,
  onAdd,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  candidates: DeckPackCandidate[];
  onAdd: (appId: number) => void;
}) {
  const query = value.trim().toLocaleLowerCase();
  const matches = query
    ? candidates
        .filter((item) => item.name.toLocaleLowerCase().includes(query))
        .slice(0, 6)
    : [];
  return (
    <div className="relative mt-4">
      <label className="text-[9px] uppercase text-repressurizer-text-faint">
        {label}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-2 text-xs text-repressurizer-text"
      />
      {matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface p-1 shadow-pop">
          {matches.map((item) => (
            <button
              key={item.appId}
              type="button"
              onClick={() => onAdd(item.appId)}
              className="block w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase text-repressurizer-text-faint">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold ${danger ? "text-repressurizer-danger" : "text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}
function reasonIcon(reason: string) {
  if (/installed/i.test(reason)) return <CheckCircle size={14} />;
  if (/offline/i.test(reason)) return <WifiSlash size={14} />;
  if (/controller|deck/i.test(reason)) return <GameController size={14} />;
  if (/long|short|duration/i.test(reason)) return <Clock size={14} />;
  if (/variety|genre|category/i.test(reason)) return <Shapes size={14} />;
  if (/limit|unknown|not enough|capacity/i.test(reason))
    return <WarningCircle size={14} />;
  return <ShieldCheck size={14} />;
}
function ReasonIcons({
  reasons,
  limitations,
}: {
  reasons: string[];
  limitations: string[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <Tooltip key={`reason-${reason}`} content={reason}>
          <span
            aria-label={reason}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/8 text-emerald-300"
          >
            {reasonIcon(reason)}
          </span>
        </Tooltip>
      ))}
      {limitations.map((reason) => (
        <Tooltip key={`limit-${reason}`} content={reason}>
          <span
            aria-label={reason}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/8 text-amber-300"
          >
            {reasonIcon(reason)}
          </span>
        </Tooltip>
      ))}
    </div>
  );
}
function IconButton({
  label,
  icon,
  onClick,
  active = false,
  tone = "neutral",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: "neutral" | "danger";
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${active ? "border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent" : tone === "danger" ? "border-repressurizer-danger/20 text-repressurizer-danger/80 hover:bg-repressurizer-danger/10" : "border-repressurizer-border text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"}`}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
