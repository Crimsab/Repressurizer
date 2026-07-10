import { useEffect, useMemo, useState } from "react";
import { ArrowSquareOut, CheckSquare, Plus, Stack, X } from "@phosphor-icons/react";
import { useCategoryStore } from "../../stores/categoryStore";
import { useGameStore } from "../../stores/gameStore";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  compareCollections,
  defaultCompareCategoryName,
  type CollectionCompareMode,
} from "../../lib/collectionCompare";
import {
  sidebarVisibleCollections,
  sortCollectionsForDisplay,
} from "../../lib/collectionSort";
import type { OwnedGame, SteamCollection } from "../../lib/types";
import { useT, type TranslationKey } from "../../lib/i18n";
import { SelectMenu } from "../ui/SelectMenu";
import { SteamImage } from "../games/SteamImage";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";

interface CollectionCompareDialogProps {
  initialCollections: SteamCollection[];
  allCollections: SteamCollection[];
  onOpenGame: (game: OwnedGame) => void;
  onClose: () => void;
}

const MODES: CollectionCompareMode[] = ["aNotB", "bNotA", "both", "xor"];

export function CollectionCompareDialog({
  initialCollections,
  allCollections,
  onOpenGame,
  onClose,
}: CollectionCompareDialogProps) {
  const t = useT();
  const games = useGameStore((s) => s.games);
  const setSelectedGameIds = useGameStore((s) => s.setSelectedGameIds);
  const addCategoryWithGames = useCategoryStore((s) => s.addCategoryWithGames);
  const pinFavorites = useSettingsStore((s) => s.pinFavorites);
  const showDynamicCategories = useSettingsStore((s) => s.showDynamicCategories);

  const collections = useMemo(
    () =>
      sortCollectionsForDisplay(
        sidebarVisibleCollections(
          allCollections.filter((collection) => !collection.is_deleted),
          { showDynamicCategories }
        ),
        { pinFavorites }
      ),
    [allCollections, pinFavorites, showDynamicCategories]
  );
  const firstKey = initialCollections[0]?.key ?? collections[0]?.key ?? "";
  const secondKey =
    initialCollections.find((collection) => collection.key !== firstKey)?.key ??
    collections.find((collection) => collection.key !== firstKey)?.key ??
    "";

  const [aKey, setAKey] = useState(firstKey);
  const [bKey, setBKey] = useState(secondKey);
  const [mode, setMode] = useState<CollectionCompareMode>("aNotB");

  const a = collections.find((collection) => collection.key === aKey) ?? null;
  const b = collections.find((collection) => collection.key === bKey) ?? null;
  const suggestedName = a && b ? defaultCompareCategoryName(a.name, b.name, mode) : "";
  const [categoryName, setCategoryName] = useState(suggestedName);

  useEffect(() => {
    setCategoryName(suggestedName);
  }, [suggestedName]);

  const resultIds = useMemo(() => {
    if (!a || !b || a.key === b.key) return [];
    return compareCollections(a, b, mode).appIds;
  }, [a, b, mode]);

  const resultGames = useMemo(() => {
    return resultIds
      .map((appId) => ({
        appId,
        name: games[appId]?.name ?? `App #${appId}`,
        game: games[appId] ?? null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name) || left.appId - right.appId);
  }, [games, resultIds]);

  const collectionOptions = collections.map((collection) => ({
    value: collection.key,
    label: `${collection.name} (${collection.added.length})`,
  }));

  const modeOptions = MODES.map((value) => ({
    value,
    label: t(`collectionCompare.mode.${value}` as TranslationKey),
  }));

  const canCreate = resultIds.length > 0 && categoryName.trim().length > 0;

  const handleCreateCategory = () => {
    if (!canCreate) return;
    addCategoryWithGames(categoryName, resultIds);
    onClose();
  };

  const handleSelectGames = () => {
    if (resultIds.length === 0) return;
    setSelectedGameIds(resultIds);
    onClose();
  };

  const handleOpenGame = (game: OwnedGame | null) => {
    if (!game) return;
    onOpenGame(game);
  };

  return (
    <DialogOverlay
      label={t("collectionCompare.title")}
      onClose={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <ResizableDialogPanel
        dialogId="collection-compare"
        defaultSize={{ width: 820, height: 700 }}
        minSize={{ width: 640, height: 480 }}
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-2xl"
      >
        {({ sizeControls }) => (
          <>
        <div className="flex items-center justify-between border-b border-repressurizer-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-repressurizer-accent/12 text-repressurizer-accent">
              <Stack size={19} weight="duotone" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-repressurizer-text">
                {t("collectionCompare.title")}
              </h2>
              <p className="text-xs text-repressurizer-text-faint tabular-nums">
                {t("collectionCompare.resultCount", { count: resultIds.length })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {sizeControls}
            <button
              type="button"
              onClick={onClose}
              className="btn-press flex h-9 w-9 items-center justify-center rounded-lg text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
              aria-label={t("common.close")}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {collections.length < 2 ? (
          <div className="p-6 text-sm text-repressurizer-text-muted">
            {t("collectionCompare.needsTwo")}
          </div>
        ) : (
          <>
            <div className="space-y-4 border-b border-repressurizer-border-subtle p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <SelectMenu
                  ariaLabel={t("collectionCompare.categoryA")}
                  label={t("collectionCompare.categoryA")}
                  value={aKey}
                  onChange={setAKey}
                  options={collectionOptions}
                  size="sm"
                  className="min-w-0"
                />
                <SelectMenu
                  ariaLabel={t("collectionCompare.categoryB")}
                  label={t("collectionCompare.categoryB")}
                  value={bKey}
                  onChange={setBKey}
                  options={collectionOptions}
                  size="sm"
                  className="min-w-0"
                />
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                  {t("collectionCompare.mode")}
                </p>
                <div className="grid gap-2 md:grid-cols-4">
                  {modeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMode(option.value)}
                      className={`btn-press min-h-10 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                        mode === option.value
                          ? "border-repressurizer-accent bg-repressurizer-accent/12 text-repressurizer-accent"
                          : "border-repressurizer-border bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-accent/50 hover:text-repressurizer-text"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {aKey === bKey ? (
                <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4 text-sm text-repressurizer-text-muted">
                  {t("collectionCompare.sameCategory")}
                </div>
              ) : resultGames.length === 0 ? (
                <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4 text-sm text-repressurizer-text-muted">
                  {t("collectionCompare.empty")}
                </div>
              ) : (
                <div className="space-y-2">
                  {resultGames.slice(0, 200).map((game) => (
                    <button
                      key={game.appId}
                      type="button"
                      onClick={() => handleOpenGame(game.game)}
                      onDoubleClick={() => handleOpenGame(game.game)}
                      disabled={!game.game}
                      title={game.game ? t("collectionCompare.openDetails") : undefined}
                      aria-label={game.game ? t("collectionCompare.openDetailsFor", { name: game.name }) : game.name}
                      className="btn-press group grid min-h-12 w-full grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_1.75rem] items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/70 p-2 text-left transition-colors hover:border-repressurizer-accent/45 hover:bg-repressurizer-surface-hover disabled:cursor-default disabled:hover:border-repressurizer-border-subtle disabled:hover:bg-repressurizer-bg/70"
                    >
                      <div className="h-8 overflow-hidden rounded-md bg-repressurizer-surface">
                        <SteamImage appId={game.appId} alt="" kind="header" className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-repressurizer-text">{game.name}</p>
                      </div>
                      <p className="text-right font-mono text-[11px] text-repressurizer-text-faint">#{game.appId}</p>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-faint group-hover:text-repressurizer-accent">
                        <ArrowSquareOut size={14} />
                      </span>
                    </button>
                  ))}
                  {resultGames.length > 200 && (
                    <p className="px-1 text-xs text-repressurizer-text-faint">
                      {t("collectionCompare.truncated", { count: resultGames.length - 200 })}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-repressurizer-border bg-repressurizer-bg/60 p-5">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                <label className="min-w-0">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                    {t("collectionCompare.newCategory")}
                  </span>
                  <input
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    className="w-full rounded-xl border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
                    placeholder={t("collectionCompare.newCategory")}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSelectGames}
                  disabled={resultIds.length === 0}
                  className="btn-press mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-repressurizer-border px-4 text-sm font-medium text-repressurizer-text hover:bg-repressurizer-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckSquare size={16} />
                  {t("collectionCompare.selectGames")}
                </button>
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={!canCreate}
                  className="btn-press mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-repressurizer-accent px-4 text-sm font-semibold text-black hover:bg-repressurizer-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={16} weight="bold" />
                  {t("collectionCompare.create")}
                </button>
              </div>
            </div>
          </>
        )}
          </>
        )}
      </ResizableDialogPanel>
    </DialogOverlay>
  );
}
