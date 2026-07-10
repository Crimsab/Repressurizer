import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppleLogo,
  ArrowsClockwise,
  CalendarBlank,
  Check,
  Clock,
  Hash,
  LinuxLogo,
  Star,
  Timer,
  WindowsLogo,
  X,
} from "@phosphor-icons/react";
import { fetchHltb } from "../../lib/tauri";
import { bestAvailableReleaseDate } from "../../lib/releaseDates";
import { extractReleaseYear } from "../../lib/search";
import { getCategoryColor } from "../../lib/categoryColors";
import type { GameDetails, OwnedGame } from "../../lib/types";
import { useCategoryStore } from "../../stores/categoryStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useNotesStore } from "../../stores/notesStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTagsStore } from "../../stores/tagsStore";
import { useT } from "../../lib/i18n";
import { CategoryChip } from "../ui/CategoryChip";
import { PriceBlock, RatingWidget, StatCard } from "./GameInfoWidgets";

export function GameInfoTab({
  details,
  loading,
  game,
  gameCategories,
  editableCollections,
  showDetailHltb,
  showDetailMetacritic,
  showDetailPrice,
  onAddToCategory,
  onRemoveFromCategory,
}: {
  details: GameDetails | null;
  loading: boolean;
  game: OwnedGame;
  gameCategories: ReturnType<typeof useCategoryStore.getState>["collections"];
  editableCollections: ReturnType<typeof useCategoryStore.getState>["collections"];
  showDetailHltb: boolean;
  showDetailMetacritic: boolean;
  showDetailPrice: boolean;
  onAddToCategory: (key: string) => void;
  onRemoveFromCategory: (key: string) => void;
}) {
  const t = useT();
  const categoryColors = useSettingsStore((s) => s.categoryColors ?? {});
  const categoryChipStyle = useSettingsStore((s) => s.categoryChipStyle);
  const gameCatKeys = useMemo(
    () => new Set(gameCategories.map((collection) => collection.key)),
    [gameCategories]
  );
  const note = useNotesStore((s) => s.notes[game.appid] ?? "");
  const setNote = useNotesStore((s) => s.setNote);
  const [noteText, setNoteText] = useState(note);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNoteText(note);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
    };
  }, [game.appid, note]);

  const handleNoteChange = (text: string) => {
    setNoteText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setNote(game.appid, text);
    }, 500);
  };

  const hltbData = useHltbStore((s) => s.data[game.appid] ?? null);
  const setHltbData = useHltbStore((s) => s.setData);
  const [fetchingHltb, setFetchingHltb] = useState(false);
  const [hltbError, setHltbError] = useState("");

  const handleFetchHltb = async () => {
    const name = String(game.name ?? "");
    if (!name) return;
    setFetchingHltb(true);
    setHltbError("");
    try {
      const data = await fetchHltb(name, game.appid, extractReleaseYear(bestAvailableReleaseDate(details)));
      if (data) setHltbData(game.appid, data);
      else setHltbError(t("detail.hltbNotFound"));
    } catch (e) {
      setHltbError(String(e));
    } finally {
      setFetchingHltb(false);
    }
  };

  const gameTags = useTagsStore((s) => s.tags[game.appid]) ?? [];
  const addTag = useTagsStore((s) => s.addTag);
  const removeTag = useTagsStore((s) => s.removeTag);
  const getAllTags = useTagsStore((s) => s.getAllTags);
  const [tagInput, setTagInput] = useState("");
  const allTags = getAllTags();
  const gameTagSet = useMemo(() => new Set(gameTags), [gameTags]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !gameTagSet.has(trimmed)) {
      addTag(game.appid, trimmed);
    }
    setTagInput("");
  };

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("detail.appId")}
          value={`#${game.appid}`}
          icon={<Hash size={16} weight="duotone" />}
        />
        <StatCard
          label={t("detail.playtime")}
          value={`${(game.playtime_forever / 60).toFixed(1)}h`}
          icon={<Clock size={16} weight="duotone" />}
        />
        <StatCard
          label={t("detail.lastPlayed")}
          value={
            game.rtime_last_played
              ? new Date(game.rtime_last_played * 1000).toLocaleDateString()
              : t("common.never")
          }
          icon={<CalendarBlank size={16} weight="duotone" />}
        />
        <StatCard
          label={t("detail.release")}
          value={bestAvailableReleaseDate(details) ?? (loading ? "..." : t("common.unknown"))}
          icon={<CalendarBlank size={16} weight="duotone" />}
        />
      </div>

      {/* HLTB + Metacritic + Price — single row */}
      {(showDetailHltb !== false || showDetailMetacritic !== false || showDetailPrice !== false) && (
      <div className="border-t border-repressurizer-border pt-5">
        <div className="flex gap-8">
          {/* HowLongToBeat */}
          {showDetailHltb !== false && (
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium flex items-center gap-1.5">
                <Timer size={12} />
                HowLongToBeat
              </h3>
              <button
                onClick={handleFetchHltb}
                disabled={fetchingHltb}
                className="inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-2 py-0.5 text-[11px] text-repressurizer-text-muted transition-colors hover:text-white disabled:opacity-40"
              >
                <ArrowsClockwise size={11} className={fetchingHltb ? "animate-spin" : ""} />
                {hltbData ? t("settings.refresh") : t("detail.fetch")}
              </button>
            </div>
            {hltbData ? (
              <div className="flex gap-4 text-sm">
                {hltbData.main_story != null && (
                  <div>
                    <p className="text-[10px] text-repressurizer-text-faint mb-0.5">{t("detail.hltbMain")}</p>
                    <p className="font-mono tabular-nums text-repressurizer-text">{hltbData.main_story}h</p>
                  </div>
                )}
                {hltbData.main_extra != null && (
                  <div>
                    <p className="text-[10px] text-repressurizer-text-faint mb-0.5">+Extras</p>
                    <p className="font-mono tabular-nums text-repressurizer-text">{hltbData.main_extra}h</p>
                  </div>
                )}
                {hltbData.completionist != null && (
                  <div>
                    <p className="text-[10px] text-repressurizer-text-faint mb-0.5">100%</p>
                    <p className="font-mono tabular-nums text-repressurizer-text">{hltbData.completionist}h</p>
                  </div>
                )}
              </div>
            ) : hltbError ? (
              <p className="text-xs text-repressurizer-danger">{hltbError}</p>
            ) : (
              <p className="text-xs text-repressurizer-text-faint">{t("detail.noDataFetch")}</p>
            )}
          </div>
          )}

          {/* Metacritic */}
          {showDetailMetacritic !== false && details?.metacritic_score != null && (
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium flex items-center gap-1.5 mb-2">
                <Star size={12} weight="duotone" />
                Metacritic
              </h3>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold ${
                    details.metacritic_score >= 75
                      ? "bg-emerald-600/20 text-emerald-400"
                      : details.metacritic_score >= 50
                        ? "bg-amber-600/20 text-amber-400"
                        : "bg-red-600/20 text-red-400"
                  }`}
                >
                  {details.metacritic_score}
                </span>
                <span className="text-[10px] text-repressurizer-text-faint leading-tight">
                  {details.metacritic_score >= 75 ? t("detail.favorable") :
                   details.metacritic_score >= 50 ? t("detail.mixed") : t("detail.unfavorable")}
                </span>
              </div>
            </div>
          )}

          {/* Price */}
          {showDetailPrice !== false && details && (details.price_initial != null || details.price_final != null || details.is_free) && (
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium mb-2">
                {t("detail.price")}
              </h3>
              <PriceBlock details={details} />
            </div>
          )}
        </div>
      </div>
      )}

      {/* Game info */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-4 w-24" />
          <div className="flex gap-2">
            <div className="skeleton h-7 w-20 rounded-full" />
            <div className="skeleton h-7 w-24 rounded-full" />
            <div className="skeleton h-7 w-16 rounded-full" />
          </div>
          <div className="skeleton h-4 w-32 mt-4" />
          <div className="skeleton h-4 w-48" />
        </div>
      ) : details ? (
        <div className="space-y-5">
          {/* Genres */}
          {details.genres.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                {t("detail.genres")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {details.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Steam tags */}
          {(details.tags ?? []).length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                {t("detail.tags")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(details.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-lg bg-repressurizer-accent/10 px-2.5 py-1 text-xs text-repressurizer-accent"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Developer / Publisher */}
          <div className="grid grid-cols-2 gap-4">
            {details.developers.length > 0 && (
              <div>
                <h3 className="mb-1 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  {t("detail.developer")}
                </h3>
                <p className="text-sm text-repressurizer-text">
                  {details.developers.join(", ")}
                </p>
              </div>
            )}
            {details.publishers.length > 0 && (
              <div>
                <h3 className="mb-1 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  {t("detail.publisher")}
                </h3>
                <p className="text-sm text-repressurizer-text">
                  {details.publishers.join(", ")}
                </p>
              </div>
            )}
          </div>

          {/* Platforms */}
          <div>
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
              {t("detail.platforms")}
            </h3>
            <div className="flex gap-2">
              {details.platforms.windows && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text">
                  <WindowsLogo size={13} weight="fill" /> Windows
                </span>
              )}
              {details.platforms.mac && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text">
                  <AppleLogo size={13} weight="fill" /> macOS
                </span>
              )}
              {details.platforms.linux && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text">
                  <LinuxLogo size={13} weight="fill" /> Linux
                </span>
              )}
            </div>
          </div>

          {/* Steam categories (features) */}
          {details.categories.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                {t("detail.features")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {details.categories.map((c) => (
                  <span
                    key={c}
                    className="rounded-lg bg-repressurizer-bg px-2.5 py-1 text-xs text-repressurizer-text-muted"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-repressurizer-text-muted">
          {t("detail.loadFailed")}
        </div>
      )}

      {/* Your categories */}
      <div className="border-t border-repressurizer-border pt-5">
        <h3 className="mb-3 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("detail.yourCategories")}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {editableCollections.map((col) => {
            const inCat = gameCatKeys.has(col.key);
            return (
              inCat ? (
                <CategoryChip
                  key={col.key}
                  name={String(col.name ?? "")}
                  color={getCategoryColor(col, categoryColors)}
                  settings={categoryChipStyle}
                  leading={<Check size={11} weight="bold" />}
                  onClick={() => onRemoveFromCategory(col.key)}
                />
              ) : (
                <button
                  key={col.key}
                  onClick={() => onAddToCategory(col.key)}
                  className="btn-press inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted transition-all hover:border-repressurizer-text-faint hover:text-repressurizer-text"
                >
                  {String(col.name ?? "")}
                </button>
              )
            );
          })}
        </div>
      </div>

      {/* Personal Tags */}
      <div className="border-t border-repressurizer-border pt-5">
        <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("detail.tags")}
        </h3>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {gameTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-500/10 px-2.5 py-1 text-xs text-sky-400"
            >
              {tag}
              <button
                onClick={() => removeTag(game.appid, tag)}
                className="ml-0.5 text-sky-400/50 hover:text-sky-400 transition-colors"
              >
                <X size={9} weight="bold" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleAddTag(); }
            }}
            placeholder={t("detail.addTag")}
            list="tag-suggestions"
            className="flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none transition-colors"
          />
          <datalist id="tag-suggestions">
            {allTags.filter((tag) => !gameTagSet.has(tag)).map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          <button
            onClick={handleAddTag}
            disabled={!tagInput.trim()}
            className="btn-press rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs text-sky-400 hover:bg-sky-500/25 disabled:opacity-40 transition-colors"
          >
            {t("detail.add")}
          </button>
        </div>
      </div>

      {/* Your Rating */}
      <RatingWidget appId={game.appid} />

      {/* Notes */}
      <div className="border-t border-repressurizer-border pt-5">
        <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("detail.notes")}
        </h3>
        <textarea
          value={noteText}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder={t("detail.notesPlaceholder")}
          rows={3}
          className="w-full resize-none rounded-xl border border-repressurizer-border bg-repressurizer-bg px-3 py-2.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none transition-colors"
        />
      </div>
    </div>
  );
}
