import { useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useCategoryStore } from "../../stores/categoryStore";
import { useGameStore } from "../../stores/gameStore";
import { useStatusStore, STATUS_META, type GameStatus } from "../../stores/statusStore";
import type { OwnedGame } from "../../lib/types";
import { useT, type TranslationKey } from "../../lib/i18n";
import { Eye, ArrowSquareOut, Check, EyeSlash, Play, Star } from "@phosphor-icons/react";

const STATUS_OPTIONS: GameStatus[] = ["none", "playing", "beaten", "completed", "abandoned"];

interface ContextMenuProps {
  x: number;
  y: number;
  game: OwnedGame;
  onClose: () => void;
  onViewDetails: (game: OwnedGame) => void;
}

export function ContextMenu({ x, y, game, onClose, onViewDetails }: ContextMenuProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const collections = useCategoryStore((s) => s.collections);
  const addGameToCategory = useCategoryStore((s) => s.addGameToCategory);
  const removeGameFromCategory = useCategoryStore((s) => s.removeGameFromCategory);
  const selectedGameIds = useGameStore((s) => s.selectedGameIds);
  const addGamesToCategory = useCategoryStore((s) => s.addGamesToCategory);
  const removeGamesFromCategory = useCategoryStore((s) => s.removeGamesFromCategory);

  const currentStatus = useStatusStore((s) => s.statuses[game.appid] ?? "none");
  const setStatus = useStatusStore((s) => s.setStatus);

  const selectedCount = Object.keys(selectedGameIds).length;
  const isMulti = selectedCount > 1 && selectedGameIds[game.appid];

  const editableCollections = [...collections]
    .filter((c) => !c.is_dynamic && c.id !== "hidden" && c.id !== "favorite")
    .sort((a, b) => a.name.localeCompare(b.name));

  const hiddenCollection = collections.find((c) => c.id === "hidden");
  const favoriteCollection = collections.find((c) => c.id === "favorite");
  const isHidden = hiddenCollection?.added.includes(game.appid) ?? false;
  const isFavorite = favoriteCollection?.added.includes(game.appid) ?? false;

  const handleToggleHidden = () => {
    if (!hiddenCollection) return;
    const ids = isMulti ? Object.keys(selectedGameIds).map(Number) : [game.appid];
    if (isHidden) {
      removeGamesFromCategory(hiddenCollection.key, ids);
    } else {
      addGamesToCategory(hiddenCollection.key, ids);
    }
    onClose();
  };

  const handleToggleFavorite = () => {
    if (!favoriteCollection) return;
    const ids = isMulti ? Object.keys(selectedGameIds).map(Number) : [game.appid];
    if (isFavorite) {
      removeGamesFromCategory(favoriteCollection.key, ids);
    } else {
      addGamesToCategory(favoriteCollection.key, ids);
    }
    onClose();
  };

  const gameInCategory = (key: string) =>
    collections.find((c) => c.key === key)?.added.includes(game.appid) ?? false;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 300),
    zIndex: 100,
  };

  const handleToggleCategory = (key: string) => {
    if (isMulti) {
      const ids = Object.keys(selectedGameIds).map(Number);
      addGamesToCategory(key, ids);
    } else {
      if (gameInCategory(key)) {
        removeGameFromCategory(key, game.appid);
      } else {
        addGameToCategory(key, game.appid);
      }
    }
    onClose();
  };

  const handleOpenStore = async () => {
    await open(`https://store.steampowered.com/app/${game.appid}`);
    onClose();
  };

  const handleLaunchGame = async () => {
    await open(`steam://rungameid/${game.appid}`);
    onClose();
  };

  return (
    <div
      ref={ref}
      style={style}
      className="min-w-[200px] animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      {/* Header */}
      <div className="border-b border-repressurizer-border px-3 py-2">
        <p className="truncate text-sm font-medium text-white">
          {isMulti ? t("context.selectedGames", { count: selectedCount }) : String(game.name ?? "")}
        </p>
      </div>

      {/* Actions */}
      <div className="py-1">
        {!isMulti && (
          <button
            onClick={() => { onViewDetails(game); onClose(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"
          >
            <Eye size={14} className="text-repressurizer-text-muted" />
            {t("context.viewDetails")}
          </button>
        )}
        {!isMulti && (
          <button
            onClick={handleLaunchGame}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"
          >
            <Play size={14} className="text-repressurizer-text-muted" weight="fill" />
            {t("context.launchSteam")}
          </button>
        )}
        <button
          onClick={handleOpenStore}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"
        >
          <ArrowSquareOut size={14} className="text-repressurizer-text-muted" />
          {t("context.openStore")}
        </button>
        {hiddenCollection && (
          <button
            onClick={handleToggleHidden}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"
          >
            <EyeSlash size={14} className="text-repressurizer-text-muted" />
            {isHidden ? t("context.unhide") : t("context.hide")}
          </button>
        )}
        {favoriteCollection && (
          <button
            onClick={handleToggleFavorite}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"
          >
            <Star size={14} className="text-repressurizer-text-muted" weight={isFavorite ? "fill" : "regular"} />
            {isFavorite ? t("context.unfavorite") : t("context.favorite")}
          </button>
        )}
      </div>

      {/* Status */}
      {!isMulti && (
        <>
          <div className="border-t border-repressurizer-border" />
          <div className="py-1">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("sort.status")}</p>
            {STATUS_OPTIONS.map((s) => {
              const meta = STATUS_META[s];
              const isActive = currentStatus === s;
              return (
                <button
                  key={s}
                  onClick={() => { setStatus(game.appid, s); onClose(); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-repressurizer-surface-hover"
                >
                  <span className={`h-2 w-2 rounded-full ${isActive ? "ring-1 ring-white" : ""} ${
                    s === "none" ? "bg-repressurizer-border" :
                    s === "playing" ? "bg-sky-400" :
                    s === "beaten" ? "bg-violet-400" :
                    s === "completed" ? "bg-repressurizer-accent" :
                    "bg-repressurizer-text-faint"
                  }`} />
                  <span className={isActive ? "text-white font-medium" : `${meta.color || "text-repressurizer-text-muted"}`}>
                    {s === "none" ? t("context.noStatus") : t(`status.${s}` as TranslationKey)}
                  </span>
                  {isActive && <Check size={12} weight="bold" className="ml-auto text-repressurizer-accent" />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Categories */}
      {editableCollections.length > 0 && (
        <>
          <div className="border-t border-repressurizer-border" />
          <div className="max-h-48 overflow-auto py-1">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
              {isMulti ? t("context.addAllTo") : t("context.categories")}
            </p>
            {editableCollections.map((col) => {
              const inCat = !isMulti && gameInCategory(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => handleToggleCategory(col.key)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors ${
                      inCat
                        ? "border-repressurizer-accent bg-repressurizer-accent text-white"
                        : "border-repressurizer-border"
                    }`}
                  >
                    {inCat && <Check size={9} weight="bold" />}
                  </span>
                  <span className="truncate">{String(col.name ?? "")}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
