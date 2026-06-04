import { useState, useEffect } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useExportUiStore } from "../../stores/exportUiStore";
import type { ExportScope, ExportFormat } from "../../lib/export";
import { exportToDisk } from "../../lib/exportAction";
import { useT, type TranslationKey } from "../../lib/i18n";
import {
  X,
  FileText,
  Table,
  FileJs,
  FileMd,
  GameController,
  FolderOpen,
  Folders,
  ChartBar,
  Export,
  CheckCircle,
  Warning,
  SelectionAll,
} from "@phosphor-icons/react";

interface ExportDialogProps {
  onClose: () => void;
}

const SCOPE_LABELS: Record<
  ExportScope,
  { label: TranslationKey; desc: TranslationKey }
> = {
  all: { label: "export.scope.all", desc: "export.scope.all.desc" },
  category: { label: "export.scope.category", desc: "export.scope.category.desc" },
  categories: { label: "export.scope.categories", desc: "export.scope.categories.desc" },
  categories_pick: { label: "export.scope.pick", desc: "export.scope.pick.desc" },
  stats: { label: "export.scope.stats", desc: "export.scope.stats.desc" },
};

const BASE_SCOPES: {
  value: ExportScope;
  icon: typeof GameController;
}[] = [
  { value: "all", icon: GameController },
  { value: "category", icon: FolderOpen },
  { value: "categories", icon: Folders },
  { value: "stats", icon: ChartBar },
];

const PICK_SCOPE = {
  value: "categories_pick" as const,
  icon: SelectionAll,
};

const FORMATS: { value: ExportFormat; label: string; icon: typeof FileText }[] = [
  { value: "txt", label: "TXT", icon: FileText },
  { value: "md", label: "Markdown", icon: FileMd },
  { value: "json", label: "JSON", icon: FileJs },
  { value: "csv", label: "CSV", icon: Table },
];

export function ExportDialog({ onClose }: ExportDialogProps) {
  const games = useGameStore((s) => s.games);
  const activeCategory = useCategoryStore((s) => s.activeCategory);
  const collections = useCategoryStore((s) => s.collections);
  const selectedCategoryKeys = useCategoryStore((s) => s.selectedCategoryKeys);
  const overrideCategoryKey = useExportUiStore((s) => s.overrideCategoryKey);
  const resetIntent = useExportUiStore((s) => s.resetIntent);

  const t = useT();

  const [scope, setScope] = useState<ExportScope>(() => useExportUiStore.getState().initialScope ?? "all");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [titlesOnly, setTitlesOnly] = useState(false);
  const [pickLayout, setPickLayout] = useState<"structured" | "flat_unique">("structured");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => () => resetIntent(), [resetIntent]);

  const effectiveCategoryKey =
    scope === "category"
      ? overrideCategoryKey ??
        (activeCategory === "all" || activeCategory === "uncategorized" ? undefined : activeCategory ?? undefined)
      : undefined;

  const effectiveCatName = effectiveCategoryKey
    ? collections.find((c) => c.key === effectiveCategoryKey)?.name
    : undefined;

  const handleExport = async () => {
    try {
      const path = await exportToDisk({
        scope,
        format,
        titlesOnly,
        games,
        collections,
        activeCategory: effectiveCategoryKey,
        categoryKeys: scope === "categories_pick" ? selectedCategoryKeys : undefined,
        pickLayout: scope === "categories_pick" ? pickLayout : undefined,
        filenameOpts:
          scope === "category"
            ? { categoryName: effectiveCatName }
            : scope === "categories_pick"
              ? { pickCount: selectedCategoryKeys.length }
              : undefined,
      });

      if (!path) return;

      setStatus("success");
      setStatusMsg(t("export.successMsg"));
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      setStatus("error");
      setStatusMsg(t("export.errorMsg", { error: String(e) }));
    }
  };

  const gameCount = Object.keys(games).length;
  const isCategoryScope = scope === "category";
  const isPickScope = scope === "categories_pick";
  const categoryDisabled =
    isCategoryScope && !effectiveCategoryKey;
  const pickDisabled = isPickScope && selectedCategoryKeys.length === 0;

  const scopeRows = [
    ...BASE_SCOPES,
    ...(selectedCategoryKeys.length >= 1 ? [PICK_SCOPE] : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-repressurizer-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Export size={18} weight="duotone" className="text-repressurizer-accent" />
            <h2 className="text-base font-semibold text-white tracking-tight">{t("export.title")}</h2>
          </div>
          <button
            onClick={onClose}
            className="btn-press flex items-center justify-center w-7 h-7 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {status !== "idle" && (
            <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
              status === "success"
                ? "border-repressurizer-success/20 bg-repressurizer-success/8 text-repressurizer-success"
                : "border-repressurizer-danger/20 bg-repressurizer-danger/8 text-repressurizer-danger"
            }`}>
              {status === "success" ? <CheckCircle size={16} weight="fill" /> : <Warning size={16} weight="fill" />}
              {statusMsg}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
              {t("export.what")}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {scopeRows.map((s) => {
                const Icon = s.icon;
                const isActive = scope === s.value;
                const { label, desc } = SCOPE_LABELS[s.value];
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setScope(s.value)}
                    className={`btn-press flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                      isActive
                        ? "border-repressurizer-accent bg-repressurizer-accent/8"
                        : "border-repressurizer-border-subtle bg-repressurizer-bg hover:border-repressurizer-border"
                    }`}
                  >
                    <Icon
                      size={16}
                      weight={isActive ? "fill" : "duotone"}
                      className={isActive ? "text-repressurizer-accent mt-0.5" : "text-repressurizer-text-faint mt-0.5"}
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${isActive ? "text-white" : "text-repressurizer-text"}`}>
                        {t(label)}
                      </p>
                      <p className="text-[11px] text-repressurizer-text-faint leading-snug mt-0.5">
                        {t(desc)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {isCategoryScope && (
              <p className="mt-2 text-xs text-repressurizer-text-muted">
                {effectiveCatName
                  ? <>{t("export.from")}: <span className="text-repressurizer-accent font-medium">{effectiveCatName}</span></>
                  : t("export.pickCategory")}
              </p>
            )}
            {isPickScope && (
              <p className="mt-2 text-xs text-repressurizer-text-muted">
                {selectedCategoryKeys.length > 0
                  ? <>{t("export.pickCount", { count: selectedCategoryKeys.length })}</>
                  : t("export.pickEmpty")}
              </p>
            )}
          </div>

          {isPickScope && selectedCategoryKeys.length >= 1 && (
            <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                {t("export.pickLayoutTitle")}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPickLayout("structured")}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-colors ${
                    pickLayout === "structured"
                      ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                      : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border"
                  }`}
                >
                  {t("export.layoutStructured")}
                </button>
                <button
                  type="button"
                  onClick={() => setPickLayout("flat_unique")}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-colors ${
                    pickLayout === "flat_unique"
                      ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                      : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border"
                  }`}
                >
                  {t("export.layoutFlat")}
                </button>
              </div>
              <p className="text-[11px] text-repressurizer-text-faint leading-snug">{t("export.pickLayoutHint")}</p>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("export.format")}</h3>
            <div className="flex gap-2">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const isActive = format === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFormat(f.value)}
                    className={`btn-press flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-repressurizer-accent bg-repressurizer-accent/8 text-white"
                        : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
                    }`}
                  >
                    <Icon size={14} weight={isActive ? "fill" : "regular"} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {scope !== "stats" && (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-2.5 transition-colors hover:border-repressurizer-border">
              <input
                type="checkbox"
                checked={titlesOnly}
                onChange={(e) => setTitlesOnly(e.target.checked)}
                className="h-4 w-4 accent-repressurizer-accent rounded"
              />
              <div className="flex-1">
                <p className="text-sm text-repressurizer-text">{t("export.titlesOnly")}</p>
                <p className="text-[11px] text-repressurizer-text-faint">{t("export.titlesOnlyDesc")}</p>
              </div>
            </label>
          )}

          <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3">
            <p className="text-xs text-repressurizer-text-muted">
              {scope === "stats" && t("export.summaryStats")}
              {scope === "all" && (
                <>
                  <span className="font-mono tabular-nums text-repressurizer-text">{gameCount}</span> {t("export.summaryAll")}{" "}
                  <span className="text-repressurizer-accent font-medium">.{format}</span>
                </>
              )}
              {scope === "category" && effectiveCatName && (
                <>
                  {t("export.summaryCategoryPrefix")} &quot;{effectiveCatName}&quot; {t("export.summaryAs")}{" "}
                  <span className="text-repressurizer-accent font-medium">.{format}</span>
                </>
              )}
              {scope === "category" && !effectiveCatName && t("export.summaryNoCategory")}
              {scope === "categories" && (
                <>
                  <span className="font-mono tabular-nums text-repressurizer-text">
                    {collections.filter((c) => c.id !== "hidden").length}
                  </span>{" "}
                  {t("export.summaryCategories")}
                  <span className="text-repressurizer-accent font-medium">.{format}</span>
                </>
              )}
              {scope === "categories_pick" && selectedCategoryKeys.length > 0 && (
                <>
                  {t("export.summaryPick", { count: selectedCategoryKeys.length })}{" "}
                  <span className="text-repressurizer-accent font-medium">.{format}</span>
                  {pickLayout === "flat_unique" && ` (${t("export.summaryFlat")})`}
                </>
              )}
              {scope === "categories_pick" && selectedCategoryKeys.length === 0 && t("export.summaryPickEmpty")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={categoryDisabled || pickDisabled || status === "success"}
            className="btn-press flex w-full items-center justify-center gap-2 rounded-xl bg-repressurizer-accent py-3 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Export size={16} weight="bold" />
            {t("export.button")}
          </button>
        </div>
      </div>
    </div>
  );
}
