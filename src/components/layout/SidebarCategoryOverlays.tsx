import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowCounterClockwise,
  ArrowsMerge,
  CopySimple,
  Export,
  Palette,
  PencilSimple,
  Stack,
  TrashSimple,
} from "@phosphor-icons/react";
import type { SteamCollection } from "../../lib/types";
import {
  CATEGORY_COLOR_SWATCHES,
  categoryPillStyle,
  normalizeHexColor,
} from "../../lib/categoryColors";
import { useT } from "../../lib/i18n";
import { DialogOverlay } from "../ui/DialogOverlay";

export function CategoryContextMenu({
  x,
  y,
  collection,
  multiExportMode,
  exportSelectedCount,
  onClose,
  onRename,
  onDelete,
  onDeleteSelected,
  onExportCategory,
  onExportSelected,
  onRefreshCategory,
  onRefreshSelected,
  onCompareCategory,
  onCompareSelected,
  onMergeSelected,
  onDuplicate,
  onColor,
}: {
  x: number;
  y: number;
  collection: SteamCollection;
  multiExportMode: boolean;
  exportSelectedCount: number;
  onClose: () => void;
  onRename: (col: SteamCollection) => void;
  onDelete: (col: SteamCollection) => void;
  onDeleteSelected: () => void;
  onExportCategory: (col: SteamCollection) => void;
  onExportSelected: () => void;
  onRefreshCategory: (col: SteamCollection) => void;
  onRefreshSelected: () => void;
  onCompareCategory: (col: SteamCollection) => void;
  onCompareSelected: () => void;
  onMergeSelected: () => void;
  onDuplicate: (col: SteamCollection) => void;
  onColor: (col: SteamCollection) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

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

  const style: CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - (multiExportMode ? 300 : 270)),
    zIndex: 100,
  };

  if (multiExportMode) {
    return (
      <div
        ref={ref}
        style={style}
        className="min-w-[180px] animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      >
        <div className="border-b border-repressurizer-border px-3 py-2">
          <p className="truncate text-sm font-medium text-white">
            {t("sidebar.category.multiTitle", { count: exportSelectedCount })}
          </p>
        </div>
        <div className="py-1">
          <button
            onClick={() => onExportSelected()}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-accent hover:bg-repressurizer-accent/10 transition-colors"
          >
            <Export size={14} weight="bold" />
            {t("sidebar.category.exportSelected", { count: exportSelectedCount })}
          </button>
          <button
            onClick={() => onRefreshSelected()}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
          >
            <ArrowCounterClockwise size={14} className="text-repressurizer-text-muted" />
            {t("sidebar.category.refreshSelected")}
          </button>
          {exportSelectedCount >= 2 && (
            <button
              onClick={() => onCompareSelected()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
            >
              <Stack size={14} className="text-repressurizer-text-muted" />
              {t("sidebar.category.compare")}
            </button>
          )}
          {exportSelectedCount >= 2 && (
            <button
              onClick={() => onMergeSelected()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
            >
              <ArrowsMerge size={14} className="text-repressurizer-text-muted" />
              {t("sidebar.category.merge")}
            </button>
          )}
          <button
            onClick={() => onDeleteSelected()}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-danger hover:bg-repressurizer-danger/10 transition-colors"
          >
            <TrashSimple size={14} />
            {t("sidebar.category.deleteSelected")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={style}
      className="min-w-[180px] animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div className="border-b border-repressurizer-border px-3 py-2">
        <p className="truncate text-sm font-medium text-white">
          {String(collection.name ?? "")}
        </p>
      </div>
      <div className="py-1">
        <button
          onClick={() => onRefreshCategory(collection)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
        >
          <ArrowCounterClockwise size={14} className="text-repressurizer-text-muted" />
          {t("sidebar.category.refreshCache")}
        </button>
        <button
          onClick={() => onCompareCategory(collection)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
        >
          <Stack size={14} className="text-repressurizer-text-muted" />
          {t("sidebar.category.compare")}
        </button>
        <button
          onClick={() => onColor(collection)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
        >
          <Palette size={14} className="text-repressurizer-text-muted" />
          {t("sidebar.category.color")}
        </button>
        <button
          onClick={() => onExportCategory(collection)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
        >
          <Export size={14} className="text-repressurizer-text-muted" />
          {t("sidebar.category.download")}
        </button>
        {!collection.is_dynamic && (
          <>
            <button
              onClick={() => onDuplicate(collection)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
            >
              <CopySimple size={14} className="text-repressurizer-text-muted" />
              {t("sidebar.category.duplicate")}
            </button>
            <button
              onClick={() => onRename(collection)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
            >
              <PencilSimple size={14} className="text-repressurizer-text-muted" />
              {t("category.rename")}
            </button>
            <button
              onClick={() => onDelete(collection)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-danger hover:bg-repressurizer-danger/10 transition-colors"
            >
              <TrashSimple size={14} />
              {t("category.delete")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function CategoryColorDialog({
  collection,
  color,
  resolvedColor,
  defaultColor,
  onClose,
  onApply,
  onReset,
}: {
  collection: SteamCollection;
  color: string;
  resolvedColor: string | null;
  defaultColor: string | null;
  onClose: () => void;
  onApply: (color: string) => void;
  onReset: () => void;
}) {
  const t = useT();
  const initial = normalizeHexColor(color) ?? resolvedColor ?? defaultColor ?? CATEGORY_COLOR_SWATCHES[1];
  const [draft, setDraft] = useState(initial);
  const normalizedDraft = normalizeHexColor(draft);

  return (
    <DialogOverlay
      label={t("category.color.title")}
      onClose={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-repressurizer-border bg-repressurizer-surface p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">{t("category.color.title")}</p>
            <p className="mt-1 truncate text-xs text-repressurizer-text-muted">{collection.name}</p>
          </div>
          <span
            className="h-8 w-8 shrink-0 rounded-xl border border-repressurizer-border"
            style={categoryPillStyle(normalizedDraft)}
          />
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-3">
          <input
            type="color"
            value={normalizedDraft ?? CATEGORY_COLOR_SWATCHES[1]}
            onChange={(e) => setDraft(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-lg border border-repressurizer-border bg-transparent"
            aria-label={t("category.color.pick")}
          />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint"
            placeholder="#10B981"
          />
        </div>

        <div className="mb-5 grid grid-cols-5 gap-2">
          {CATEGORY_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setDraft(swatch)}
              className="btn-press h-8 rounded-lg border border-repressurizer-border transition-transform hover:scale-105"
              style={{ backgroundColor: swatch }}
              aria-label={swatch}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onReset}
            className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border px-3 py-1.5 text-sm text-repressurizer-text-muted hover:text-repressurizer-text"
          >
            <ArrowCounterClockwise size={14} />
            {defaultColor ? t("category.color.resetDefault") : t("category.color.clear")}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-press rounded-lg px-3 py-1.5 text-sm text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"
            >
              {t("category.cancel")}
            </button>
            <button
              type="button"
              disabled={!normalizedDraft}
              onClick={() => normalizedDraft && onApply(normalizedDraft)}
              className="btn-press rounded-lg bg-repressurizer-accent px-3 py-1.5 text-sm text-white hover:bg-repressurizer-accent-hover disabled:opacity-40"
            >
              {t("category.color.apply")}
            </button>
          </div>
        </div>
      </div>
    </DialogOverlay>
  );
}

export function DeleteConfirmDialog({
  names,
  onConfirm,
  onCancel,
}: {
  names: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const isBatch = names.length > 1;
  return (
    <DialogOverlay
      label={isBatch ? t("category.deleteSelectedConfirm", { count: names.length }) : t("category.deleteConfirm")}
      onClose={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-xs animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
        <p className="mb-1 text-sm font-medium text-white">
          {isBatch
            ? t("category.deleteSelectedConfirm", { count: names.length })
            : t("category.deleteConfirm")}
        </p>
        <p className="mb-5 text-sm text-repressurizer-text-muted leading-relaxed">
          {isBatch
            ? t("category.deleteSelectedDesc", { count: names.length })
            : t("category.deleteDesc", { name: names[0] ?? "" })}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-press rounded-lg px-3.5 py-1.5 text-sm text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            {t("category.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="btn-press rounded-lg bg-repressurizer-danger px-3.5 py-1.5 text-sm text-white transition-colors hover:bg-repressurizer-danger/80"
          >
            {t("category.delete")}
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}
