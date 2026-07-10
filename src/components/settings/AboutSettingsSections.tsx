import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  ArrowCounterClockwise,
  CheckCircle,
  CloudArrowDown,
  Warning,
  X,
} from "@phosphor-icons/react";
import { changelogEntries } from "../../lib/changelog";
import { useT } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { SelectMenu } from "../ui/SelectMenu";
import { ChangelogPanel } from "./data/SettingsDataPanels";

const UPDATE_CHECK_INTERVAL_OPTIONS = [6, 12, 24, 72, 168] as const;

interface AboutSettingsSectionsProps {
  isSectionVisible: (id: string) => boolean;
  onReset: () => void;
}

export function AboutSettingsSections({
  isSectionVisible,
  onReset,
}: AboutSettingsSectionsProps) {
  const settings = useSettingsStore();
  const t = useT();
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateMessage, setUpdateMessage] = useState<{
    text: string;
    tone: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (!updateMessage) return;
    const timer = window.setTimeout(() => setUpdateMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [updateMessage]);

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setAvailableUpdate(null);
    setUpdateMessage(null);
    try {
      const update = await check();
      setAvailableUpdate(update);
      setUpdateMessage({
        text: update
          ? t("settings.updates.available", { version: update.version })
          : t("settings.updates.current"),
        tone: "success",
      });
    } catch (error) {
      setUpdateMessage({
        text: t("settings.updates.checkFailed", { error: String(error) }),
        tone: "error",
      });
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;
    setInstallingUpdate(true);
    setUpdateMessage(null);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch (error) {
      setUpdateMessage({
        text: t("settings.updates.installFailed", { error: String(error) }),
        tone: "error",
      });
      setInstallingUpdate(false);
    }
  };

  return (
    <>
      {isSectionVisible("updates") && (
        <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
          <p className="flex flex-wrap items-center gap-2 font-medium text-repressurizer-text">
            <span>Repressurizer v{__APP_DISPLAY_VERSION__}</span>
            {__APP_CHANNEL__ === "preview" && (
              <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Preview
              </span>
            )}
          </p>
          <button
            onClick={handleCheckUpdates}
            disabled={checkingUpdates || installingUpdate}
            className="btn-press mt-3 flex w-full items-start gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-3 py-2.5 text-left transition-colors hover:border-repressurizer-border disabled:opacity-50"
          >
            <CloudArrowDown
              size={16}
              weight="duotone"
              className="mt-0.5 text-repressurizer-accent"
            />
            <span>
              <span className="block text-sm text-repressurizer-text">
                {checkingUpdates
                  ? t("settings.updates.checking")
                  : t("settings.updates.check")}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
                {t("settings.updates.desc")}
              </span>
            </span>
          </button>
          {availableUpdate && (
            <button
              onClick={handleInstallUpdate}
              disabled={installingUpdate}
              className="btn-press mt-3 w-full rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-50"
            >
              {installingUpdate
                ? t("settings.updates.installing")
                : t("settings.updates.install", { version: availableUpdate.version })}
            </button>
          )}
          {updateMessage && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                updateMessage.tone === "error"
                  ? "border-repressurizer-danger/20 bg-repressurizer-danger/8 text-repressurizer-danger"
                  : "border-repressurizer-success/20 bg-repressurizer-success/8 text-repressurizer-success"
              }`}
            >
              {updateMessage.tone === "error" ? (
                <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
              ) : (
                <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0" />
              )}
              <p className="min-w-0 flex-1 leading-relaxed">{updateMessage.text}</p>
              <button
                type="button"
                onClick={() => setUpdateMessage(null)}
                aria-label={t("settings.message.dismiss")}
                className="btn-press -mr-1 -mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-current opacity-60 transition-opacity hover:bg-white/5 hover:opacity-100"
              >
                <X size={12} weight="bold" />
              </button>
            </div>
          )}
          <div className="mt-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 px-3 py-2.5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-repressurizer-text">
                  {t("settings.updates.autoCheck")}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                  {t("settings.updates.autoCheck.desc", {
                    hours: settings.updateAutoCheckIntervalHours || 12,
                  })}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.checkUpdatesOnStartup ?? true}
                onClick={() =>
                  settings.setSettings({
                    checkUpdatesOnStartup: !(settings.checkUpdatesOnStartup ?? true),
                  })
                }
                className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                  settings.checkUpdatesOnStartup ?? true
                    ? "border-repressurizer-accent bg-repressurizer-accent/20"
                    : "border-repressurizer-border bg-repressurizer-surface"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full transition-transform ${
                    settings.checkUpdatesOnStartup ?? true
                      ? "translate-x-[22px] bg-repressurizer-accent"
                      : "translate-x-[3px] bg-repressurizer-text-muted"
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-repressurizer-border-subtle pt-3">
              <span className="text-xs text-repressurizer-text-muted">
                {t("settings.updates.autoCheck.interval")}
              </span>
              <SelectMenu
                ariaLabel={t("settings.updates.autoCheck.interval")}
                value={String(settings.updateAutoCheckIntervalHours || 12)}
                onChange={(value) =>
                  settings.setSettings({ updateAutoCheckIntervalHours: Number(value) })
                }
                align="right"
                size="sm"
                className="w-[140px] shrink-0"
                buttonClassName="bg-repressurizer-bg"
                options={UPDATE_CHECK_INTERVAL_OPTIONS.map((hours) => ({
                  value: String(hours),
                  label: t("settings.interval.hours", { count: hours }),
                }))}
              />
            </div>
          </div>
          <div className="mt-4 border-t border-repressurizer-border-subtle pt-4">
            <p className="text-xs font-medium text-repressurizer-text-muted">
              {t("settings.credits.title")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
              {t("settings.credits.body")}{" "}
              <button
                type="button"
                onClick={() => void open("https://github.com/Crimsab")}
                className="text-repressurizer-accent underline-offset-2 transition-colors hover:underline"
              >
                @Crimsab
              </button>
              .
            </p>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
              {t("settings.credits.thanks")}
            </p>
          </div>
        </div>
      )}

      {isSectionVisible("changelog") && <ChangelogPanel entries={changelogEntries} />}

      {isSectionVisible("reset") && (
        <div className="pt-2">
          <button
            onClick={onReset}
            className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-danger/30 px-4 py-2 text-sm text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/10"
          >
            <ArrowCounterClockwise size={14} />
            {t("settings.reset")}
          </button>
          <p className="mt-1.5 text-xs text-repressurizer-text-faint">
            {t("settings.reset.desc")}
          </p>
        </div>
      )}
    </>
  );
}
