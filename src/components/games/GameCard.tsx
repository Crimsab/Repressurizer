import { useMemo, useRef } from "react";
import { useCategoryStore } from "../../stores/categoryStore";
import { useGameStore } from "../../stores/gameStore";
import { useStatusStore, STATUS_META } from "../../stores/statusStore";
import { useTagsStore } from "../../stores/tagsStore";
import { useFamilyStore } from "../../stores/familyStore";
import type { OwnedGame } from "../../lib/types";
import { X, Clock, UsersThree } from "@phosphor-icons/react";
import { SteamImage } from "./SteamImage";

interface GameCardProps {
  game: OwnedGame;
  onContextMenu: (e: React.MouseEvent, game: OwnedGame) => void;
  onDoubleClick: (game: OwnedGame) => void;
  onShiftClick?: (appId: number) => void;
}

export function GameCard({ game, onContextMenu, onDoubleClick, onShiftClick }: GameCardProps) {
  const isSelected = useGameStore((s) => !!s.selectedGameIds[game.appid]);
  const toggleGameSelection = useGameStore((s) => s.toggleGameSelection);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const collections = useCategoryStore((s) => s.collections);
  const removeGameFromCategory = useCategoryStore((s) => s.removeGameFromCategory);
  const status = useStatusStore((s) => s.statuses[game.appid] ?? "none");
  const statusMeta = STATUS_META[status];
  const isFamilyShared = useFamilyStore((s) => s.isFamilyShared(game.appid));
  const lastClickTime = useRef(0);

  const categories = useMemo(
    () => collections.filter((c) => c.added.includes(game.appid) && !c.is_dynamic),
    [collections, game.appid]
  );

  const gameTags = useTagsStore((s) => s.tags[game.appid]) ?? [];
  const hours = (game.playtime_forever / 60).toFixed(1);
  const allCatNames = categories.map((c) => c.name).join(", ");

  const handleClick = (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClickTime.current < 300) {
      lastClickTime.current = 0;
      onDoubleClick(game);
      return;
    }
    lastClickTime.current = now;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    if (isShift && onShiftClick) {
      onShiftClick(game.appid);
    } else if (isCtrl) {
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
        lastClickTime.current = 0;
        e.dataTransfer.setData("text/plain", String(game.appid));
        if (!isSelected) {
          clearSelection();
          toggleGameSelection(game.appid);
        }
      }}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(e, game)}
      className={`game-card group cursor-pointer overflow-hidden rounded-xl ${
        isSelected
          ? "border-2 border-repressurizer-accent"
          : "border border-repressurizer-border hover:border-repressurizer-text-faint"
      }`}
    >
      {/* Game image */}
      <div className="relative aspect-[46/21.5] overflow-hidden bg-repressurizer-surface">
        <SteamImage
          appId={game.appid}
          alt={String(game.name ?? "")}
          kind="header"
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
        />
        {isSelected && (
          <div className="absolute inset-0 bg-repressurizer-accent/15 pointer-events-none" />
        )}
        {status !== "none" && (
          <div className={`absolute top-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.color} ${statusMeta.bg}`}>
            {statusMeta.label}
          </div>
        )}
        {isFamilyShared && (
          <div className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-medium text-black shadow-sm">
            <UsersThree size={10} weight="bold" />
            Family
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-repressurizer-surface p-2.5 pb-3 h-[98px]">
        <h3 className="truncate text-sm font-medium text-white leading-tight">
          {String(game.name ?? "")}
        </h3>
        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-repressurizer-text-muted">
          <Clock size={11} className="text-repressurizer-text-faint" />
          <span className="font-mono tabular-nums">{hours}h</span>
        </p>

        {/* Category chips */}
        <div
          className="mt-1.5 flex items-center gap-1 overflow-hidden h-[18px]"
          title={categories.length > 2 ? allCatNames : undefined}
        >
          {categories.slice(0, 2).map((cat) => (
            <span
              key={cat.key}
              title={String(cat.name ?? "")}
              className="group/badge inline-flex shrink-0 items-center rounded-md bg-repressurizer-accent/10 px-1.5 py-0.5 text-[10px] text-repressurizer-accent/80"
            >
              <span className="max-w-[80px] truncate">{String(cat.name ?? "")}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeGameFromCategory(cat.key, game.appid);
                }}
                className="ml-0.5 hidden text-repressurizer-danger group-hover/badge:inline"
              >
                <X size={8} weight="bold" />
              </button>
            </span>
          ))}
          {categories.length > 2 && (
            <span className="shrink-0 text-[10px] text-repressurizer-text-faint font-mono" title={allCatNames}>
              +{categories.length - 2}
            </span>
          )}
        </div>

        {/* Personal tag chips */}
        {gameTags.length > 0 && (
          <div className="mt-1 flex items-center gap-1 overflow-hidden h-[18px]">
            {gameTags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="shrink-0 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-400/80"
              >
                {tag}
              </span>
            ))}
            {gameTags.length > 2 && (
              <span className="shrink-0 text-[10px] text-repressurizer-text-faint font-mono">
                +{gameTags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
