import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import {
  CheckCircle,
  FileText,
  Warning,
  X,
} from "@phosphor-icons/react";
import { parseAppIdImportText } from "../../../lib/appIdImport";
import { useT } from "../../../lib/i18n";
import { useCategoryStore } from "../../../stores/categoryStore";
import { useGameStore } from "../../../stores/gameStore";
import { useSteamAppIndexStore } from "../../../stores/steamAppIndexStore";
import { DialogOverlay } from "../../ui/DialogOverlay";
import { SelectMenu } from "../../ui/SelectMenu";

type ImportMode = "new" | "existing";

export function AppIdImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const t = useT();
  const games = useGameStore((state) => state.games);
  const collections = useCategoryStore((state) => state.collections);
  const addCategoryWithGames = useCategoryStore((state) => state.addCategoryWithGames);
  const addGamesToCategory = useCategoryStore((state) => state.addGamesToCategory);
  const setActiveCategory = useCategoryStore((state) => state.setActiveCategory);
  const [mode, setMode] = useState<ImportMode>("new");
  const [collectionName, setCollectionName] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [text, setText] = useState("");
  const [includeMissing, setIncludeMissing] = useState(true);
  const [error, setError] = useState("");

  const targets = useMemo(
    () => collections.filter((collection) =>
      !collection.is_dynamic &&
      !collection.is_deleted &&
      collection.key !== "user-collections.hidden" &&
      collection.key !== "user-collections.favorite"
    ),
    [collections]
  );
  const parsed = useMemo(() => parseAppIdImportText(text), [text]);
  const missingIds = useMemo(
    () => parsed.appIds.filter((appId) => !games[appId]),
    [games, parsed.appIds]
  );
  const eligibleIds = useMemo(
    () => includeMissing ? parsed.appIds : parsed.appIds.filter((appId) => !!games[appId]),
    [games, includeMissing, parsed.appIds]
  );
  const selectedTarget = targets.find((collection) => collection.key === targetKey);
  const alreadyInTarget = useMemo(() => {
    if (mode !== "existing" || !selectedTarget) return 0;
    const existing = new Set(selectedTarget.added);
    return eligibleIds.filter((appId) => existing.has(appId)).length;
  }, [eligibleIds, mode, selectedTarget]);
  const importCount = eligibleIds.length - alreadyInTarget;
  const duplicateName = mode === "new" && collections.some((collection) =>
    !collection.is_deleted && collection.name.trim().toLocaleLowerCase() === collectionName.trim().toLocaleLowerCase()
  );
  const canImport = importCount > 0 && (
    mode === "new" ? !!collectionName.trim() && !duplicateName : !!selectedTarget
  );

  const chooseFile = async () => {
    setError("");
    try {
      const path = await open({
        multiple: false,
        filters: [
          { name: "App ID list", extensions: ["txt", "csv", "list"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (!path || Array.isArray(path)) return;
      const content = await readTextFile(path);
      setSourcePath(path);
      setText(content);
    } catch (reason) {
      setError(t("settings.appIdImport.readFailed", { error: String(reason) }));
    }
  };

  const applyImport = () => {
    if (!canImport) return;
    const currentGames = useGameStore.getState().games;
    const placeholders = eligibleIds
      .filter((appId) => !currentGames[appId])
      .map((appId) => ({
        appid: appId,
        name: useSteamAppIndexStore.getState().resolveName(appId) ?? `App ${appId}`,
        playtime_forever: 0,
        img_icon_url: null,
        rtime_last_played: 0,
        is_collection_only: true,
      }));
    if (placeholders.length > 0) useGameStore.getState().mergeGames(placeholders);

    let destinationName = collectionName.trim();
    if (mode === "new") {
      addCategoryWithGames(destinationName, eligibleIds);
      const created = useCategoryStore.getState().collections.at(-1);
      if (created) setActiveCategory(created.key);
    } else if (selectedTarget) {
      destinationName = selectedTarget.name;
      addGamesToCategory(selectedTarget.key, eligibleIds);
      setActiveCategory(selectedTarget.key);
    }

    onImported(t("settings.appIdImport.success", {
      count: importCount,
      collection: destinationName,
      local: placeholders.length,
    }));
    onClose();
  };

  return (
    <DialogOverlay
      label={t("settings.appIdImport.title")}
      onClose={onClose}
      className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[min(760px,calc(100vh-64px))] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog">
        <div className="flex items-start justify-between gap-4 border-b border-repressurizer-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-repressurizer-text">{t("settings.appIdImport.title")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">{t("settings.appIdImport.desc")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white">
            <X size={16} weight="bold" />
          </button>
        </div>

        <div data-testid="appid-import-body" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="min-w-0 space-y-4">
              <section>
                <p className="text-xs font-semibold text-repressurizer-text">{t("settings.appIdImport.source")}</p>
                <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2">
                    <p className="truncate font-mono text-xs text-repressurizer-text-muted">{sourcePath || t("settings.appIdImport.noFile")}</p>
                  </div>
                  <button type="button" onClick={() => void chooseFile()} className="btn-press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-repressurizer-border px-3 py-2 text-xs font-medium text-repressurizer-text transition-colors hover:border-repressurizer-accent/50 hover:text-repressurizer-accent">
                    <FileText size={14} />
                    {t("settings.appIdImport.choose")}
                  </button>
                </div>
                <textarea
                  value={text}
                  onChange={(event) => { setText(event.target.value); setSourcePath(""); }}
                  placeholder={t("settings.appIdImport.placeholder")}
                  data-testid="appid-import-text"
                  className="mt-2 h-48 w-full resize-y rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 font-mono text-xs leading-relaxed text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-repressurizer-text-faint">{t("settings.appIdImport.format")}</p>
              </section>

              <label className="flex items-start gap-2.5 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2.5">
                <input type="checkbox" checked={includeMissing} onChange={(event) => setIncludeMissing(event.target.checked)} className="mt-0.5 accent-repressurizer-accent" />
                <span>
                  <span className="block text-xs font-medium text-repressurizer-text">{t("settings.appIdImport.includeMissing")}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-repressurizer-text-faint">{t("settings.appIdImport.includeMissing.desc")}</span>
                </span>
              </label>
            </div>

            <div className="min-w-0 space-y-4">
              <section>
                <p className="text-xs font-semibold text-repressurizer-text">{t("settings.appIdImport.destination")}</p>
                <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={t("settings.appIdImport.destination")}>
                  {(["new", "existing"] as ImportMode[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setMode(value);
                        if (value === "existing" && !targetKey) {
                          setTargetKey(targets[0]?.key ?? "");
                        }
                      }}
                      disabled={value === "existing" && targets.length === 0}
                      className={`btn-press rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${mode === value ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent" : "border-repressurizer-border text-repressurizer-text-muted hover:text-repressurizer-text"}`}
                    >
                      {t(value === "new" ? "settings.appIdImport.new" : "settings.appIdImport.existing")}
                    </button>
                  ))}
                </div>
                {mode === "new" ? (
                  <div className="mt-3">
                    <label htmlFor="appid-import-collection-name" className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint">{t("settings.appIdImport.collectionName")}</label>
                    <input id="appid-import-collection-name" value={collectionName} onChange={(event) => setCollectionName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none" />
                    {duplicateName && <p className="mt-1 text-[11px] text-repressurizer-danger">{t("settings.appIdImport.duplicateName")}</p>}
                  </div>
                ) : (
                  <SelectMenu
                    value={targetKey}
                    options={targets.map((collection) => ({ value: collection.key, label: `${collection.name} (${collection.added.length})` }))}
                    onChange={setTargetKey}
                    placeholder={t("settings.appIdImport.selectCollection")}
                    ariaLabel={t("settings.appIdImport.selectCollection")}
                    className="mt-3 w-full"
                    testId="appid-import-target"
                  />
                )}
              </section>

              <section className="border-t border-repressurizer-border-subtle pt-4">
                <p className="text-xs font-semibold text-repressurizer-text">{t("settings.appIdImport.preview")}</p>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                  <PreviewStat testId="appid-import-valid" label={t("settings.appIdImport.valid")} value={parsed.appIds.length} tone="success" />
                  <PreviewStat testId="appid-import-to-add" label={t("settings.appIdImport.toAdd")} value={Math.max(0, importCount)} tone="success" />
                  <PreviewStat testId="appid-import-duplicates" label={t("settings.appIdImport.duplicates")} value={parsed.duplicateCount + alreadyInTarget} />
                  <PreviewStat testId="appid-import-invalid" label={t("settings.appIdImport.invalid")} value={parsed.invalidEntries.length} tone={parsed.invalidEntries.length > 0 ? "warning" : "default"} />
                  <PreviewStat testId="appid-import-outside-library" label={t("settings.appIdImport.outsideLibrary")} value={missingIds.length} />
                </div>
                {parsed.invalidEntries.length > 0 && (
                  <p className="mt-3 break-words rounded-lg bg-amber-500/8 px-3 py-2 font-mono text-[10px] leading-relaxed text-amber-300">
                    {parsed.invalidEntries.slice(0, 8).join(", ")}{parsed.invalidEntries.length > 8 ? ` +${parsed.invalidEntries.length - 8}` : ""}
                  </p>
                )}
                <div className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-repressurizer-text-faint">
                  <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-repressurizer-accent" />
                  <span>{t("settings.appIdImport.offline")}</span>
                </div>
              </section>
            </div>
          </div>

          {error && <div className="mt-4 flex items-start gap-2 rounded-lg border border-repressurizer-danger/25 bg-repressurizer-danger/8 px-3 py-2 text-xs text-repressurizer-danger"><Warning size={15} className="mt-0.5 shrink-0" />{error}</div>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-repressurizer-border px-5 py-3">
          <p className="text-[11px] text-repressurizer-text-faint">{t("settings.appIdImport.staged")}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-press rounded-lg px-4 py-2 text-sm text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white">{t("common.cancel")}</button>
            <button type="button" onClick={applyImport} disabled={!canImport} className="btn-press rounded-lg bg-repressurizer-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:cursor-not-allowed disabled:opacity-40">
              {t("settings.appIdImport.importCount", { count: Math.max(0, importCount) })}
            </button>
          </div>
        </div>
      </div>
    </DialogOverlay>
  );
}

function PreviewStat({ label, value, testId, tone = "default" }: { label: string; value: number; testId: string; tone?: "default" | "success" | "warning" }) {
  const color = tone === "success" ? "text-repressurizer-accent" : tone === "warning" ? "text-amber-300" : "text-repressurizer-text";
  return <div data-testid={testId}><p className={`font-mono text-lg font-semibold tabular-nums ${color}`}>{value.toLocaleString()}</p><p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</p></div>;
}
