import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowsClockwise,
  CheckCircle,
  Cloud,
  FolderOpen,
  GitBranch,
  Network,
  Pause,
  Play,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useT, type TranslationKey } from "../../lib/i18n";
import { useProfileSyncStore } from "../../stores/profileSyncStore";
import { useToastStore } from "../../stores/toastStore";
import { SelectMenu } from "../ui/SelectMenu";
import { Tooltip } from "../ui/Tooltip";

const SYNC_TARGETS = [
  { key: "drive", icon: Cloud },
  { key: "cloud", icon: Cloud },
  { key: "network", icon: Network },
  { key: "git", icon: GitBranch },
] as const;

export function ProfileSyncPanel() {
  const t = useT();
  const sync = useProfileSyncStore();
  const toast = useToastStore;
  const [choices, setChoices] = useState<
    Record<string, "local" | "remote" | "base">
  >({});

  const chooseFolder = async () => {
    const path = await open({ directory: true, multiple: false });
    if (typeof path === "string") sync.configure({ folder: path });
  };
  const runSync = async () => {
    try {
      const result = await sync.syncNow();
      if (result === "synced")
        toast.getState().success(t("profiles.sync.done"));
      else if (result === "conflicts")
        toast.getState().info(t("profiles.sync.conflictsFound"));
    } catch (error) {
      toast
        .getState()
        .error(t("profiles.sync.failed", { error: String(error) }));
    }
  };
  const resolve = async () => {
    try {
      await sync.resolvePending(choices);
      setChoices({});
      toast.getState().success(t("profiles.sync.done"));
    } catch (error) {
      toast
        .getState()
        .error(t("profiles.sync.failed", { error: String(error) }));
    }
  };

  return (
    <section className="border-t border-repressurizer-border-subtle p-4 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {t("profiles.sync.title")}
          </h3>
          <p className="mt-1 text-xs text-repressurizer-text-faint">
            {t("profiles.sync.description")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => sync.configure({ paused: !sync.paused })}
            className="inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted"
          >
            {sync.paused ? <Play size={13} /> : <Pause size={13} />}
            {sync.paused ? t("profiles.sync.resume") : t("profiles.sync.pause")}
          </button>
          <button
            onClick={() => void runSync()}
            disabled={!sync.folder || sync.paused || sync.syncing}
            className="inline-flex items-center gap-1 rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            <ArrowsClockwise
              size={13}
              className={sync.syncing ? "animate-spin" : ""}
            />
            {sync.syncing ? t("profiles.sync.syncing") : t("profiles.sync.now")}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-y border-repressurizer-border-subtle py-3">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-repressurizer-text-faint">
          {t("profiles.sync.worksWith")}
        </span>
        {SYNC_TARGETS.map(({ key, icon: Icon }) => (
          <Tooltip
            key={key}
            content={t(`profiles.sync.target.${key}.hint` as TranslationKey)}
          >
            <button
              type="button"
              onClick={() => void chooseFolder()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border px-2.5 py-1.5 text-[10px] text-repressurizer-text-muted hover:border-repressurizer-accent/50 hover:text-white"
            >
              <Icon size={13} />
              {t(`profiles.sync.target.${key}` as TranslationKey)}
            </button>
          </Tooltip>
        ))}
      </div>

      <ol className="mt-3 grid gap-2 text-[10px] text-repressurizer-text-muted sm:grid-cols-3">
        {["folder", "file", "provider"].map((step, index) => (
          <li key={step} className="flex items-start gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-repressurizer-accent/10 font-mono text-repressurizer-accent">
              {index + 1}
            </span>
            <span>{t(`profiles.sync.step.${step}` as TranslationKey)}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <button
          onClick={() => void chooseFolder()}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-left text-xs text-repressurizer-text-muted"
        >
          <FolderOpen size={14} />
          <span className="truncate">
            {sync.folder || t("profiles.sync.chooseFolder")}
          </span>
        </button>
        <label className="flex items-center gap-2 text-xs text-repressurizer-text-muted">
          <input
            type="checkbox"
            checked={sync.automatic}
            onChange={(event) =>
              sync.configure({ automatic: event.target.checked })
            }
          />
          {t("profiles.sync.automatic")}
        </label>
        <label className="flex items-center gap-2 text-xs text-repressurizer-text-muted">
          {t("profiles.sync.interval")}
          <input
            type="number"
            min={5}
            max={1440}
            value={sync.intervalMinutes}
            onChange={(event) =>
              sync.configure({ intervalMinutes: Number(event.target.value) })
            }
            className="w-16 appearance-none rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-repressurizer-text-faint">
        <span>
          {t("profiles.sync.last")}:{" "}
          {sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString() : "—"}
        </span>
        <span>
          {t("profiles.sync.source")}: {sync.lastSourceDevice ?? "—"}
        </span>
        <span>
          {t("profiles.sync.changed")}: {sync.lastChangedItems}
        </span>
        {sync.lastError && (
          <span className="text-repressurizer-danger">
            {t("profiles.sync.error")}: {sync.lastError}
          </span>
        )}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-300">
        <CheckCircle size={12} className="mt-0.5 shrink-0" />
        {t("profiles.sync.steamNotice")}
      </p>

      {sync.pending && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-amber-200">
                {t("profiles.sync.resolveTitle")}
              </h4>
              <p className="text-[10px] text-repressurizer-text-faint">
                {t("profiles.sync.resolveDescription", {
                  device: sync.pending.remoteDevice,
                })}
              </p>
            </div>
            <button
              onClick={() => void resolve()}
              className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-medium text-black"
            >
              {t("profiles.sync.applyMerge")}
            </button>
          </div>
          <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
            {sync.pending.merge.conflicts.map((conflict) => (
              <div
                key={conflict.path}
                className="grid gap-2 rounded-lg border border-repressurizer-border-subtle p-2 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <code className="min-w-0 truncate text-[10px] text-repressurizer-text">
                  {conflict.path}
                </code>
                <SelectMenu
                  value={choices[conflict.path] ?? "local"}
                  onChange={(value) =>
                    setChoices((state) => ({
                      ...state,
                      [conflict.path]: value as "local" | "remote" | "base",
                    }))
                  }
                  options={[
                    { value: "local", label: t("profiles.sync.keepLocal") },
                    { value: "remote", label: t("profiles.sync.keepRemote") },
                    { value: "base", label: t("profiles.sync.keepBase") },
                  ]}
                  ariaLabel={`${t("profiles.sync.choice")} ${conflict.path}`}
                  size="sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
