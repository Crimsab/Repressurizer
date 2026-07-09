import { useEffect, useState, type ReactNode } from "react";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { BellRinging, GameController, Monitor, Tray } from "@phosphor-icons/react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useT } from "../../lib/i18n";
import type { AppStartupMode } from "../../lib/types";
import { SelectMenu } from "../ui/SelectMenu";
import { ToggleRow } from "./SettingsControls";

const LIBRARY_REFRESH_INTERVAL_OPTIONS = [15, 30, 60, 180, 360] as const;

export function BackgroundSettingsSection() {
  const minimizeToTray = useSettingsStore((state) => state.minimizeToTray);
  const startOnLogin = useSettingsStore((state) => state.startOnLogin);
  const startOnLoginMode = useSettingsStore((state) => state.startOnLoginMode);
  const desktopNotifications = useSettingsStore((state) => state.desktopNotifications);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const t = useT();
  const [autostartRegistered, setAutostartRegistered] = useState<boolean | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [autostartError, setAutostartError] = useState("");

  useEffect(() => {
    let cancelled = false;
    isAutostartEnabled()
      .then((enabled) => {
        if (cancelled) return;
        setAutostartRegistered(enabled);
        if (enabled !== startOnLogin) setSettings({ startOnLogin: enabled });
      })
      .catch((error) => {
        if (!cancelled) setAutostartError(t("settings.startOnLogin.failed", { error: String(error) }));
      });
    return () => {
      cancelled = true;
    };
  }, [setSettings, startOnLogin, t]);

  const handleStartOnLoginChange = async (enabled: boolean) => {
    setAutostartBusy(true);
    setAutostartError("");
    try {
      if (enabled) await enableAutostart();
      else await disableAutostart();
      const registered = await isAutostartEnabled();
      setAutostartRegistered(registered);
      setSettings({ startOnLogin: registered });
      if (enabled && !registered) setAutostartError(t("settings.startOnLogin.notRegistered"));
    } catch (error) {
      setAutostartError(t("settings.startOnLogin.failed", { error: String(error) }));
    } finally {
      setAutostartBusy(false);
    }
  };

  const startModes = [
    {
      value: "tray" as const,
      label: t("settings.startOnLoginMode.tray"),
      description: t("settings.startOnLoginMode.tray.desc"),
      icon: <Tray size={15} weight="duotone" />,
    },
    {
      value: "window" as const,
      label: t("settings.startOnLoginMode.window"),
      description: t("settings.startOnLoginMode.window.desc"),
      icon: <Monitor size={15} weight="duotone" />,
    },
  ] satisfies Array<{ value: AppStartupMode; label: string; description: string; icon: ReactNode }>;

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.background")}</h3>
      <ToggleRow
        icon={<Tray size={15} weight="duotone" />}
        label={autostartBusy ? t("settings.startOnLogin.checking") : t("settings.startOnLogin")}
        description={t("settings.startOnLogin.desc")}
        checked={startOnLogin ?? false}
        onChange={handleStartOnLoginChange}
      />
      {(startOnLogin || autostartRegistered) && (
        <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-repressurizer-text">{t("settings.startOnLoginMode")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                {autostartRegistered === true
                  ? t("settings.startOnLogin.registered")
                  : t("settings.startOnLogin.notRegistered")}
              </p>
            </div>
            {autostartError && (
              <p className="max-w-[280px] text-right text-xs leading-relaxed text-repressurizer-danger">
                {autostartError}
              </p>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {startModes.map((option) => {
              const selected = (startOnLoginMode ?? "tray") === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSettings({ startOnLoginMode: option.value })}
                  className={`btn-press flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                      : "border-repressurizer-border-subtle bg-repressurizer-surface/40 text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
                  }`}
                >
                  <span className={`mt-0.5 shrink-0 ${selected ? "text-repressurizer-accent" : "text-repressurizer-text-faint"}`}>{option.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <ToggleRow
        icon={<BellRinging size={15} weight="duotone" />}
        label={t("settings.desktopNotifications")}
        description={t("settings.desktopNotifications.desc")}
        checked={desktopNotifications ?? true}
        onChange={(value) => setSettings({ desktopNotifications: value })}
      />
      <ToggleRow
        icon={<Tray size={15} weight="duotone" />}
        label={t("settings.minimizeToTray")}
        description={t("settings.minimizeToTray.desc")}
        checked={minimizeToTray ?? false}
        onChange={(value) => setSettings({ minimizeToTray: value })}
      />
    </div>
  );
}

export function SteamLibraryRefreshSection() {
  const enabled = useSettingsStore((state) => state.autoRefreshLibraryEnabled);
  const intervalMinutes = useSettingsStore((state) => state.libraryAutoRefreshIntervalMinutes) || 30;
  const setSettings = useSettingsStore((state) => state.setSettings);
  const t = useT();

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.libraryAutoRefresh")}</h3>
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <GameController size={15} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-accent" />
            <div className="min-w-0">
              <p className="text-sm text-repressurizer-text">{t("settings.libraryAutoRefresh")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                {t("settings.libraryAutoRefresh.desc", { minutes: intervalMinutes })}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled ?? false}
            onClick={() => setSettings({ autoRefreshLibraryEnabled: !(enabled ?? false) })}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
              enabled
                ? "border-repressurizer-accent bg-repressurizer-accent/20"
                : "border-repressurizer-border bg-repressurizer-surface"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full transition-transform ${
                enabled
                  ? "translate-x-[22px] bg-repressurizer-accent"
                  : "translate-x-[3px] bg-repressurizer-text-muted"
              }`}
            />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-repressurizer-border-subtle pt-3">
          <span className="text-xs text-repressurizer-text-muted">{t("settings.libraryAutoRefresh.interval")}</span>
          <SelectMenu
            ariaLabel={t("settings.libraryAutoRefresh.interval")}
            value={String(intervalMinutes)}
            onChange={(value) => setSettings({ libraryAutoRefreshIntervalMinutes: Number(value) })}
            align="right"
            size="sm"
            className="w-[140px] shrink-0"
            buttonClassName="bg-repressurizer-surface"
            options={LIBRARY_REFRESH_INTERVAL_OPTIONS.map((minutes) => ({
              value: String(minutes),
              label: t("settings.interval.minutes", { count: minutes }),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
