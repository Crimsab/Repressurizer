import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Backpack,
  BellSimple,
  BookmarkSimple,
  CalendarBlank,
  ChartBar,
  CircleDashed,
  ClockCounterClockwise,
  Folder,
  GameController,
  HardDrives,
  MagnifyingGlass,
  Notebook,
  Package,
  Pulse,
  Sidebar,
  SquaresFour,
  Stack,
  Trophy,
  UserCircle,
  UsersThree,
  Wrench,
} from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { useCategoryStore } from "../../stores/categoryStore";
import { useGameStore } from "../../stores/gameStore";
import { SteamImage } from "../games/SteamImage";

type PaletteGroup = "views" | "tools" | "games";

interface PaletteItem {
  id: string;
  group: PaletteGroup;
  label: string;
  icon?: ReactNode;
  appId?: number;
  run: () => void;
}

const GROUP_ORDER: PaletteGroup[] = ["views", "tools", "games"];

export function CommandPalette() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const collections = useCategoryStore((state) => state.collections);
  const setActiveCategory = useCategoryStore((state) => state.setActiveCategory);
  const games = useGameStore((state) => state.games);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const openTool = (tool: string) => {
    window.dispatchEvent(new CustomEvent("repressurizer-open-tool", { detail: tool }));
  };

  const items = useMemo<PaletteItem[]>(() => {
    const prefix = query.startsWith("#") ? "games" : null;
    const normalized = (prefix ? query.slice(1) : query).trim().toLocaleLowerCase();
    const match = (label: string) => !normalized || label.toLocaleLowerCase().includes(normalized);

    const views: PaletteItem[] = [
      { id: "view-all", group: "views", label: t("sidebar.all"), icon: <SquaresFour size={14} />, run: () => setActiveCategory("all") },
      { id: "view-diary", group: "views", label: t("sidebar.diary"), icon: <Notebook size={14} />, run: () => setActiveCategory("diary") },
      ...collections.map((collection) => ({
        id: `view-${collection.key}`,
        group: "views" as const,
        label: collection.name,
        icon: <Folder size={14} />,
        run: () => setActiveCategory(collection.key),
      })),
      { id: "view-uncategorized", group: "views", label: t("sidebar.uncategorized"), icon: <CircleDashed size={14} />, run: () => setActiveCategory("uncategorized") },
      { id: "view-backlog", group: "views", label: t("sidebar.backlog"), icon: <Stack size={14} />, run: () => setActiveCategory("backlog") },
      { id: "view-recent", group: "views", label: t("sidebar.recentlyPlayed"), icon: <ClockCounterClockwise size={14} />, run: () => setActiveCategory("recently-played") },
    ];
    const tools: PaletteItem[] = [
      { id: "tool-hunter", group: "tools", label: t("toolbar.hunter"), icon: <Trophy size={14} />, run: () => openTool("hunter") },
      { id: "tool-achievements", group: "tools", label: t("toolbar.achievements"), icon: <Trophy size={14} />, run: () => openTool("achievements") },
      { id: "tool-stats", group: "tools", label: t("toolbar.stats"), icon: <ChartBar size={14} />, run: () => openTool("stats") },
      { id: "tool-wishlist", group: "tools", label: t("toolbar.wishlist"), icon: <BookmarkSimple size={14} />, run: () => openTool("wishlist") },
      { id: "tool-recommend", group: "tools", label: t("toolbar.recommend"), icon: <GameController size={14} />, run: () => openTool("recommend") },
      { id: "tool-storage", group: "tools", label: t("toolbar.storage"), icon: <HardDrives size={14} />, run: () => openTool("storage") },
      { id: "tool-deck", group: "tools", label: t("toolbar.deckPack"), icon: <Backpack size={14} />, run: () => openTool("deck-pack") },
      { id: "tool-profiles", group: "tools", label: t("toolbar.profiles"), icon: <UserCircle size={14} />, run: () => openTool("profiles") },
      { id: "tool-inbox", group: "tools", label: t("toolbar.inbox"), icon: <BellSimple size={14} />, run: () => openTool("inbox") },
      { id: "tool-timemachine", group: "tools", label: t("toolbar.timeMachine"), icon: <ClockCounterClockwise size={14} />, run: () => openTool("time-machine") },
      { id: "tool-packs", group: "tools", label: t("toolbar.communityPacks"), icon: <Package size={14} />, run: () => openTool("community-packs") },
      { id: "tool-health", group: "tools", label: t("toolbar.metadataHealth"), icon: <Pulse size={14} />, run: () => openTool("metadata-health") },
      { id: "tool-friends", group: "tools", label: t("toolbar.friendCompare"), icon: <UsersThree size={14} />, run: () => openTool("friends") },
      { id: "tool-timeline", group: "tools", label: t("toolbar.timeline"), icon: <CalendarBlank size={14} />, run: () => openTool("timeline") },
    ];
    const gameItems: PaletteItem[] =
      !normalized
        ? []
        : Object.values(games)
            .filter((game) => String(game.name ?? "").toLocaleLowerCase().includes(normalized))
            .slice(0, 8)
            .map((game) => ({
              id: `game-${game.appid}`,
              group: "games" as const,
              label: String(game.name ?? ""),
              appId: game.appid,
              run: () => window.dispatchEvent(new CustomEvent("repressurizer-open-game", { detail: { appId: game.appid } })),
            }));

    const all = [...views, ...tools, ...gameItems];
    return all.filter((item) => (prefix ? item.group === prefix : match(item.label)));
  }, [collections, games, query, setActiveCategory, t]);

  const flatItems = items;

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const runItem = (item: PaletteItem) => {
    setOpen(false);
    item.run();
  };

  const groupMeta: Record<PaletteGroup, { label: string; icon: ReactNode }> = {
    views: { label: t("palette.views"), icon: <Sidebar size={11} weight="fill" /> },
    tools: { label: t("palette.tools"), icon: <Wrench size={11} weight="fill" /> },
    games: { label: t("palette.games"), icon: <GameController size={11} weight="fill" /> },
  };

  return createPortal(
    <div
      data-testid="command-palette"
      role="dialog"
      aria-label={t("palette.title")}
      className="fixed inset-0 z-[85] bg-black/55 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="animate-fade-in mx-auto mt-24 w-[min(600px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface-raised/95 shadow-dialog backdrop-blur-md">
        <label className="flex items-center gap-2 border-b border-repressurizer-border-subtle px-3 py-2.5">
          <MagnifyingGlass size={14} className="shrink-0 text-repressurizer-text-faint" />
          <input
            ref={inputRef}
            data-testid="command-palette-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current) => Math.min(flatItems.length - 1, current + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current) => Math.max(0, current - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const item = flatItems[active];
                if (item) runItem(item);
              } else if (event.ctrlKey && /^[1-9]$/.test(event.key)) {
                event.preventDefault();
                const item = flatItems[Number(event.key) - 1];
                if (item) runItem(item);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint"
          />
          <kbd className="shrink-0 rounded border border-repressurizer-border-subtle bg-repressurizer-bg px-1.5 py-0.5 font-mono text-[9px] text-repressurizer-text-faint">{t("palette.esc")}</kbd>
        </label>
        <div ref={listRef} className="max-h-[min(440px,60vh)] overflow-y-auto p-1.5">
          {flatItems.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-repressurizer-text-faint">{t("palette.empty")}</p>
          )}
          {GROUP_ORDER.map((group) => {
            const groupItems = flatItems.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group}>
                <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">
                  {groupMeta[group].icon}
                  {groupMeta[group].label}
                </p>
                {groupItems.map((item) => {
                  const index = flatItems.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-active={index === active ? "true" : "false"}
                      onPointerEnter={() => setActive(index)}
                      onClick={() => runItem(item)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${index === active ? "bg-repressurizer-surface-hover text-white" : "text-repressurizer-text"}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-repressurizer-border-subtle bg-repressurizer-bg ${index === active ? "text-repressurizer-accent" : "text-repressurizer-text-faint"}`}>
                        {item.group === "games" && item.appId !== undefined
                          ? <SteamImage appId={item.appId} alt="" kind="capsule" className="h-full w-full rounded-md object-cover" />
                          : item.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {index < 9 && (
                        <kbd className="shrink-0 rounded border border-repressurizer-border-subtle bg-repressurizer-bg px-1 font-mono text-[9px] text-repressurizer-text-faint">Ctrl+{index + 1}</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
