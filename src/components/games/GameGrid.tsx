import { lazy, Suspense, useMemo, useState, useCallback, useRef } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useStatusStore, STATUS_META } from "../../stores/statusStore";
import { useTagsStore } from "../../stores/tagsStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { useReviewStore } from "../../stores/reviewStore";
import { useFamilyStore } from "../../stores/familyStore";
import { MAX_FAIL_RUNS, useFailedGamesStore } from "../../stores/failedGamesStore";
import { matchesSavedAdvancedFilter, useAdvancedFilterStore } from "../../stores/advancedFilterStore";
import { GameCard } from "./GameCard";
import type { OwnedGame } from "../../lib/types";
import { useT, type TranslationKey } from "../../lib/i18n";
import { Spinner, MagnifyingGlass, FolderOpen, Clock, UsersThree } from "@phosphor-icons/react";
import { extractReleaseYear, parseSearchQuery, matchesFilter, hasAdvancedFilters } from "../../lib/search";
import { possibleDuplicateAppIds } from "../../lib/gameIdentity";

const loadGameDetailPage = () => import("./GameDetailPage").then((m) => ({ default: m.GameDetailPage }));
const loadContextMenu = () => import("./ContextMenu").then((m) => ({ default: m.ContextMenu }));
const GameDetailPage = lazy(loadGameDetailPage);
const ContextMenu = lazy(loadContextMenu);
const preloadGameDetailPage = () => { void loadGameDetailPage(); };
const preloadContextMenu = () => { void loadContextMenu(); };

interface ContextMenuState {
  x: number;
  y: number;
  game: OwnedGame;
}

export function GameGrid() {
  const t = useT();
  const games = useGameStore((s) => s.games);
  const searchQuery = useGameStore((s) => s.searchQuery);
  const sortBy = useGameStore((s) => s.sortBy);
  const sortAsc = useGameStore((s) => s.sortAsc);
  const viewMode = useGameStore((s) => s.viewMode);
  const loading = useGameStore((s) => s.loading);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const rangeSelectGames = useGameStore((s) => s.rangeSelectGames);
  const filters = useGameStore((s) => s.filters);
  const statuses = useStatusStore((s) => s.statuses);
  const allGameTags = useTagsStore((s) => s.tags);
  const hltbData = useHltbStore((s) => s.data);
  const achievementSummaries = useAchievementsStore((s) => s.summaries);
  const details = useGameStore((s) => s.details);
  const reviews = useReviewStore((s) => s.reviews);
  const familyApps = useFamilyStore((s) => s.apps);
  const failedGames = useFailedGamesStore((s) => s.fails);
  const savedAdvancedFilters = useAdvancedFilterStore((s) => s.filters);
  const activeAdvancedFilterId = useAdvancedFilterStore((s) => s.activeFilterId);
  const { activeCategory, collections } = useCategoryStore();
  const lastClickedId = useRef<number | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [detailGame, setDetailGame] = useState<OwnedGame | null>(null);
  const duplicateAppIds = useMemo(() => possibleDuplicateAppIds(Object.values(games)), [games]);
  const delistedAppIds = useMemo(
    () =>
      new Set(
        Object.entries(failedGames)
          .filter(([, count]) => count >= MAX_FAIL_RUNS)
          .map(([id]) => Number(id))
      ),
    [failedGames]
  );
  const activeAdvancedFilter = useMemo(
    () => savedAdvancedFilters.find((filter) => filter.id === activeAdvancedFilterId) ?? null,
    [savedAdvancedFilters, activeAdvancedFilterId]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, game: OwnedGame) => {
    e.preventDefault();
    preloadContextMenu();
    setContextMenu({ x: e.clientX, y: e.clientY, game });
  }, []);

  const handleDoubleClick = useCallback((game: OwnedGame) => {
    preloadGameDetailPage();
    setDetailGame(game);
  }, []);

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      clearSelection();
    }
  };

  const filteredGames = useMemo(() => {
    let gameList: OwnedGame[] = Object.values(games);

    // Exclude hidden games from "All" view
    const hiddenCol = collections.find((c) => c.id === "hidden");
    const hiddenIds = hiddenCol ? new Set(hiddenCol.added) : new Set<number>();

    if (activeCategory === "uncategorized") {
      const categorized = new Set(collections.flatMap((c) => c.added));
      gameList = gameList.filter((g) => !categorized.has(g.appid) && !hiddenIds.has(g.appid));
    } else if (activeCategory === "backlog") {
      gameList = gameList.filter((g) => g.playtime_forever === 0 && !hiddenIds.has(g.appid));
    } else if (activeCategory === "recently-played") {
      const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
      gameList = gameList.filter((g) => g.rtime_last_played > cutoff && !hiddenIds.has(g.appid));
    } else if (activeCategory === "steam-family") {
      gameList = gameList.filter((g) => {
        const familyApp = familyApps[g.appid];
        return !!familyApp && familyApp.is_family_shared && familyApp.exclude_reason === 0 && !hiddenIds.has(g.appid);
      });
    } else if (activeCategory === "hidden") {
      gameList = gameList.filter((g) => hiddenIds.has(g.appid));
    } else if (activeCategory && activeCategory !== "all") {
      const col = collections.find((c) => c.key === activeCategory);
      if (col) {
        const appIds = new Set(col.added);
        gameList = gameList.filter((g) => appIds.has(g.appid));
      }
    } else {
      // "all" — exclude hidden
      gameList = gameList.filter((g) => !hiddenIds.has(g.appid));
    }

    if (searchQuery.trim()) {
      if (hasAdvancedFilters(searchQuery)) {
        const filter = parseSearchQuery(searchQuery);
        gameList = gameList.filter((g) =>
          matchesFilter(g, details[g.appid], statuses, allGameTags, reviews, filter, {
            hltbData,
            achievements: achievementSummaries,
            familyApps,
            duplicateAppIds,
            delistedAppIds,
          })
        );
      } else {
        const q = searchQuery.toLowerCase();
        gameList = gameList.filter((g) => g.name.toLowerCase().includes(q));
      }
    }

    // Playtime filters
    if (filters.onlyUnplayed) {
      gameList = gameList.filter((g) => g.playtime_forever === 0);
    } else {
      if (filters.minHours !== null) {
        gameList = gameList.filter((g) => g.playtime_forever / 60 >= filters.minHours!);
      }
      if (filters.maxHours !== null) {
        gameList = gameList.filter((g) => g.playtime_forever / 60 <= filters.maxHours!);
      }
    }

    // Status filter
    if (filters.statuses.length > 0) {
      gameList = gameList.filter((g) => {
        const s = statuses[g.appid] ?? "none";
        return filters.statuses.includes(s as "playing" | "beaten" | "completed" | "abandoned");
      });
    }

    // Tag filter
    if (filters.tagFilter.length > 0) {
      gameList = gameList.filter((g) => {
        const gameTags = allGameTags[g.appid] ?? [];
        return filters.tagFilter.every((t) => gameTags.includes(t));
      });
    }

    // HLTB duration filter
    if (filters.minHltbHours !== null || filters.maxHltbHours !== null) {
      gameList = gameList.filter((g) => {
        const hltb = hltbData[g.appid];
        const hours = hltb?.main_story ?? null;
        if (hours == null) return false; // exclude games without HLTB data when filter is active
        if (filters.minHltbHours !== null && hours < filters.minHltbHours) return false;
        if (filters.maxHltbHours !== null && hours > filters.maxHltbHours) return false;
        return true;
      });
    }

    if (filters.minReleaseYear !== null || filters.maxReleaseYear !== null) {
      gameList = gameList.filter((g) => {
        const year = extractReleaseYear(details[g.appid]?.release_date);
        if (year == null) return false;
        if (filters.minReleaseYear !== null && year < filters.minReleaseYear) return false;
        if (filters.maxReleaseYear !== null && year > filters.maxReleaseYear) return false;
        return true;
      });
    }

    if (filters.platforms.length > 0) {
      gameList = gameList.filter((g) => {
        const platforms = details[g.appid]?.platforms;
        return !!platforms && filters.platforms.some((platform) => platforms[platform]);
      });
    }

    if (filters.minMetacritic !== null || filters.maxMetacritic !== null) {
      gameList = gameList.filter((g) => {
        const score = details[g.appid]?.metacritic_score ?? null;
        if (score == null) return false;
        if (filters.minMetacritic !== null && score < filters.minMetacritic) return false;
        if (filters.maxMetacritic !== null && score > filters.maxMetacritic) return false;
        return true;
      });
    }

    if (filters.minAchievementPct !== null || filters.maxAchievementPct !== null) {
      gameList = gameList.filter((g) => {
        const summary = achievementSummaries[g.appid];
        if (!summary || summary.total <= 0) return false;
        const pct = (summary.achieved / summary.total) * 100;
        if (filters.minAchievementPct !== null && pct < filters.minAchievementPct) return false;
        if (filters.maxAchievementPct !== null && pct > filters.maxAchievementPct) return false;
        return true;
      });
    }

    if (filters.onlyFamilyShared) {
      gameList = gameList.filter((g) => {
        const familyApp = familyApps[g.appid];
        return !!familyApp && familyApp.is_family_shared && familyApp.exclude_reason === 0;
      });
    }

    if (filters.onlyPossibleDuplicates) {
      gameList = gameList.filter((g) => duplicateAppIds.has(g.appid));
    }

    if (filters.onlyMissingDetails) {
      gameList = gameList.filter((g) => !details[g.appid]);
    }

    if (filters.onlyDelisted) {
      gameList = gameList.filter((g) => delistedAppIds.has(g.appid));
    }

    if (filters.onlyCollectionOnly) {
      gameList = gameList.filter((g) => g.is_collection_only);
    }

    if (activeAdvancedFilter) {
      gameList = gameList.filter((g) =>
        matchesSavedAdvancedFilter(g.appid, activeAdvancedFilter, collections)
      );
    }

    const STATUS_ORDER: Record<string, number> = {
      playing: 0, completed: 1, beaten: 2, abandoned: 3, none: 4,
    };

    gameList.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "playtime":
          cmp = a.playtime_forever - b.playtime_forever;
          break;
        case "lastPlayed":
          cmp = a.rtime_last_played - b.rtime_last_played;
          break;
        case "appid":
          cmp = a.appid - b.appid;
          break;
        case "metacritic": {
          const sa = details[a.appid]?.metacritic_score ?? -1;
          const sb = details[b.appid]?.metacritic_score ?? -1;
          cmp = sa - sb;
          break;
        }
        case "hltb": {
          const ha = hltbData[a.appid]?.main_story ?? -1;
          const hb = hltbData[b.appid]?.main_story ?? -1;
          cmp = ha - hb;
          break;
        }
        case "achievements": {
          const sa = achievementSummaries[a.appid];
          const sb = achievementSummaries[b.appid];
          const pa = sa && sa.total > 0 ? sa.achieved / sa.total : -1;
          const pb = sb && sb.total > 0 ? sb.achieved / sb.total : -1;
          cmp = pa - pb;
          break;
        }
        case "status": {
          const oa = STATUS_ORDER[statuses[a.appid] ?? "none"] ?? 4;
          const ob = STATUS_ORDER[statuses[b.appid] ?? "none"] ?? 4;
          cmp = oa - ob;
          break;
        }
      }
      return sortAsc ? cmp : -cmp;
    });

    return gameList;
  }, [games, activeCategory, collections, familyApps, searchQuery, sortBy, sortAsc, filters, activeAdvancedFilter, statuses, allGameTags, hltbData, achievementSummaries, details, reviews, duplicateAppIds, delistedAppIds]);

  const orderedIds = useMemo(() => filteredGames.map((g) => g.appid), [filteredGames]);

  const handleShiftClick = useCallback((appId: number) => {
    const last = lastClickedId.current;
    if (last !== null && last !== appId) {
      rangeSelectGames(last, appId, orderedIds);
    }
    lastClickedId.current = appId;
  }, [orderedIds, rangeSelectGames]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center animate-fade-in">
          <Spinner size={28} className="mx-auto mb-3 text-repressurizer-accent animate-spin" />
          <p className="text-sm text-repressurizer-text-muted">{t("games.loading")}</p>
        </div>
      </div>
    );
  }

  if (filteredGames.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center animate-fade-in">
          {searchQuery ? (
            <>
              <MagnifyingGlass size={36} weight="duotone" className="mx-auto mb-3 text-repressurizer-text-faint" />
              <p className="text-sm text-repressurizer-text-muted">{t("games.noMatches", { query: searchQuery })}</p>
            </>
          ) : (
            <>
              <FolderOpen size={36} weight="duotone" className="mx-auto mb-3 text-repressurizer-text-faint" />
              <p className="text-sm text-repressurizer-text-muted">{t("games.emptyCategory")}</p>
              <p className="mt-1 text-xs text-repressurizer-text-faint">{t("games.emptyCategory.desc")}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {viewMode === "list" ? (
        <div className="space-y-0.5" onClick={handleBackgroundClick}>
          {filteredGames.map((game) => (
            <GameListRow
              key={game.appid}
              game={game}
              onContextMenu={handleContextMenu}
              onDoubleClick={handleDoubleClick}
              onIntent={preloadGameDetailPage}
              onShiftClick={handleShiftClick}
              isPossibleDuplicate={duplicateAppIds.has(game.appid)}
            />
          ))}
        </div>
      ) : (
        <div
          className="game-grid grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3"
          onClick={handleBackgroundClick}
        >
          {filteredGames.map((game) => (
            <GameCard
              key={game.appid}
              game={game}
              onContextMenu={handleContextMenu}
              onDoubleClick={handleDoubleClick}
              onIntent={preloadGameDetailPage}
              onShiftClick={handleShiftClick}
              isPossibleDuplicate={duplicateAppIds.has(game.appid)}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <Suspense fallback={null}>
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            game={contextMenu.game}
            onClose={() => setContextMenu(null)}
            onViewDetails={handleDoubleClick}
          />
        </Suspense>
      )}

      {detailGame && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />}>
          <GameDetailPage
            game={detailGame}
            onClose={() => setDetailGame(null)}
          />
        </Suspense>
      )}
    </>
  );
}

function GameListRow({
  game,
  onContextMenu,
  onDoubleClick,
  onIntent,
  onShiftClick,
  isPossibleDuplicate,
}: {
  game: OwnedGame;
  onContextMenu: (e: React.MouseEvent, game: OwnedGame) => void;
  onDoubleClick: (game: OwnedGame) => void;
  onIntent?: () => void;
  onShiftClick?: (appId: number) => void;
  isPossibleDuplicate?: boolean;
}) {
  const toggleGameSelection = useGameStore((s) => s.toggleGameSelection);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const isSelected = useGameStore((s) => !!s.selectedGameIds[game.appid]);
  const collections = useCategoryStore((s) => s.collections);
  const t = useT();
  const status = useStatusStore((s) => s.statuses[game.appid] ?? "none");
  const statusMeta = STATUS_META[status];
  const isFamilyShared = useFamilyStore((s) => s.isFamilyShared(game.appid));

  const categories = useMemo(
    () => collections.filter((c) => c.added.includes(game.appid) && !c.is_dynamic),
    [collections, game.appid]
  );

  const hours = (game.playtime_forever / 60).toFixed(1);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && onShiftClick) {
      onShiftClick(game.appid);
    } else if (e.ctrlKey || e.metaKey) {
      toggleGameSelection(game.appid);
    } else {
      const store = useGameStore.getState();
      const selectedKeys = Object.keys(store.selectedGameIds);
      if (isSelected && selectedKeys.length === 1) {
        clearSelection();
      } else {
        clearSelection();
        toggleGameSelection(game.appid);
      }
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(game.appid));
        if (!isSelected) {
          clearSelection();
          toggleGameSelection(game.appid);
        }
      }}
      onClick={handleClick}
      onDoubleClick={() => onDoubleClick(game)}
      onContextMenu={(e) => onContextMenu(e, game)}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        isSelected
          ? "bg-repressurizer-accent/8 ring-1 ring-repressurizer-accent/40"
          : "hover:bg-repressurizer-surface-hover"
      }`}
    >
      <span className="flex-1 truncate text-sm text-white">{String(game.name ?? "")}</span>
      {(isPossibleDuplicate || game.is_collection_only) && (
        <span className="shrink-0 rounded-md border border-repressurizer-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-repressurizer-text-faint">
          #{game.appid}
        </span>
      )}
      {game.is_collection_only && (
        <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
          {t("games.local")}
        </span>
      )}
      {status !== "none" && (
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.color} ${statusMeta.bg}`}>
          {t(`status.${status}` as TranslationKey)}
        </span>
      )}
      {isFamilyShared && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-400/20 bg-sky-400/12 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
          <UsersThree size={10} weight="duotone" />
          {t("games.family")}
        </span>
      )}
      <span className="inline-flex items-center gap-1 font-mono text-xs text-repressurizer-text-faint tabular-nums">
        <Clock size={11} />
        {hours}h
      </span>
      <div className="flex gap-1">
        {categories.slice(0, 3).map((cat) => (
          <span
            key={cat.key}
            title={String(cat.name ?? "")}
            className="rounded-md bg-repressurizer-accent/10 px-1.5 py-0.5 text-[10px] text-repressurizer-accent/70"
          >
            {String(cat.name ?? "")}
          </span>
        ))}
        {categories.length > 3 && (
          <span
            className="text-[10px] text-repressurizer-text-faint font-mono"
            title={categories.map((c) => c.name).join(", ")}
          >
            +{categories.length - 3}
          </span>
        )}
      </div>
    </div>
  );
}
