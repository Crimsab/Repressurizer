import { useState } from "react";
import { CloudArrowDown, Plus, TrashSimple } from "@phosphor-icons/react";
import { useSettingsStore } from "../../stores/settingsStore";
import { testProxyProfile } from "../../lib/tauri";
import { hltbModeLabel, HLTB_TIME_MODES } from "../../lib/hltb";
import { useT } from "../../lib/i18n";
import type {
  AppSettings,
  HltbTimeMode,
  LibraryRefreshCacheMode,
  ProxyProfile,
  ProxyRotationMode,
  ProxyType,
} from "../../lib/types";
import { SelectMenu } from "../ui/SelectMenu";
import { NumberSetting } from "./SettingsControls";

const LIBRARY_REFRESH_CACHE_OPTIONS: Array<{
  value: LibraryRefreshCacheMode;
  labelKey: "settings.libraryRefreshCacheMode.none" | "settings.libraryRefreshCacheMode.basic" | "settings.libraryRefreshCacheMode.full";
  descriptionKey: "settings.libraryRefreshCacheMode.none.desc" | "settings.libraryRefreshCacheMode.basic.desc" | "settings.libraryRefreshCacheMode.full.desc";
}> = [
  {
    value: "full",
    labelKey: "settings.libraryRefreshCacheMode.full",
    descriptionKey: "settings.libraryRefreshCacheMode.full.desc",
  },
  {
    value: "basic",
    labelKey: "settings.libraryRefreshCacheMode.basic",
    descriptionKey: "settings.libraryRefreshCacheMode.basic.desc",
  },
  {
    value: "none",
    labelKey: "settings.libraryRefreshCacheMode.none",
    descriptionKey: "settings.libraryRefreshCacheMode.none.desc",
  },
];

function clampIntegerInput(value: string, fallback: number, min: number, max: number): number {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function PerformanceSettingsSection() {
  const settings = useSettingsStore();
  const t = useT();
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null);

  const updateProxySettings = (patch: Partial<AppSettings["proxySettings"]>) => {
    settings.setSettings({
      proxySettings: {
        ...settings.proxySettings,
        ...patch,
        scopes: {
          ...settings.proxySettings.scopes,
          ...(patch.scopes ?? {}),
        },
        profiles: patch.profiles ?? settings.proxySettings.profiles,
      },
    });
  };

  const updateProxyProfile = (id: string, patch: Partial<ProxyProfile>) => {
    const profiles = settings.proxySettings.profiles.map((profile) =>
      profile.id === id ? { ...profile, ...patch } : profile
    );
    updateProxySettings({ profiles });
  };

  const handleAddProxyProfile = () => {
    const id = `proxy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const profile: ProxyProfile = {
      id,
      name: `Proxy ${settings.proxySettings.profiles.length + 1}`,
      type: "http",
      host: "",
      port: 8080,
      username: "",
      password: "",
      enabled: true,
      batchSize: 1,
      lastTestStatus: "",
      lastTestMessage: "",
      lastTestLatencyMs: 0,
      lastTestAt: 0,
    };
    updateProxySettings({
      activeProfileId: settings.proxySettings.activeProfileId || id,
      profiles: [...settings.proxySettings.profiles, profile],
    });
  };

  const handleRemoveProxyProfile = (id: string) => {
    const profiles = settings.proxySettings.profiles.filter((profile) => profile.id !== id);
    updateProxySettings({
      profiles,
      activeProfileId:
        settings.proxySettings.activeProfileId === id
          ? profiles[0]?.id ?? ""
          : settings.proxySettings.activeProfileId,
    });
  };

  const handleTestProxyProfile = async (profile: ProxyProfile) => {
    setTestingProxyId(profile.id);
    try {
      const result = await testProxyProfile(profile);
      updateProxyProfile(profile.id, {
        lastTestStatus: result.ok ? "ok" : "failed",
        lastTestMessage: result.message,
        lastTestLatencyMs: result.latencyMs,
        lastTestAt: Date.now(),
      });
    } catch (error) {
      updateProxyProfile(profile.id, {
        lastTestStatus: "failed",
        lastTestMessage: String(error),
        lastTestLatencyMs: 0,
        lastTestAt: Date.now(),
      });
    } finally {
      setTestingProxyId(null);
    }
  };

  return (
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.fetchSpeed")}</h3>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-repressurizer-text">{t("settings.hltbConcurrency")}</p>
                    <span className="font-mono text-sm text-repressurizer-accent tabular-nums">{settings.hltbConcurrency ?? 5}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={settings.hltbConcurrency ?? 5}
                    onChange={(e) => settings.setSettings({ hltbConcurrency: Number(e.target.value) })}
                    className="w-full accent-repressurizer-accent"
                  />
                  <p className="text-xs text-repressurizer-text-faint">
                    {t("settings.hltbConcurrency.desc")}
                  </p>
                  <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
                    <p className="mb-1.5 text-xs text-repressurizer-text-faint">{t("settings.hltbTimeMode")}</p>
                    <SelectMenu
                      ariaLabel={t("settings.hltbTimeMode")}
                      value={settings.hltbTimeMode}
                      onChange={(hltbTimeMode) => settings.setSettings({ hltbTimeMode: hltbTimeMode as HltbTimeMode })}
                      size="sm"
                      className="w-full"
                      options={HLTB_TIME_MODES.map((mode) => ({
                        value: mode,
                        label: hltbModeLabel(mode),
                      }))}
                    />
                    <p className="mt-1.5 text-[11px] leading-relaxed text-repressurizer-text-faint">
                      {t("settings.hltbTimeMode.desc")}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-repressurizer-text">{t("settings.achievementsConcurrency")}</p>
                    <span className="font-mono text-sm text-repressurizer-accent tabular-nums">{settings.achievementsConcurrency ?? 5}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={settings.achievementsConcurrency ?? 5}
                    onChange={(e) => settings.setSettings({ achievementsConcurrency: Number(e.target.value) })}
                    className="w-full accent-repressurizer-accent"
                  />
                  <p className="text-xs text-repressurizer-text-faint">
                    {t("settings.achievementsConcurrency.desc")}
                  </p>
                </div>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberSetting
                      label={t("settings.steamDetailsDelay")}
                      value={settings.steamDetailsDelayMs ?? 1200}
                      suffix="ms"
                      min={100}
                      max={30000}
                      step={100}
                      onChange={(steamDetailsDelayMs) => settings.setSettings({ steamDetailsDelayMs })}
                    />
                    <NumberSetting
                      label={t("settings.steamRatingsDelay")}
                      value={settings.steamRatingsDelayMs ?? 1200}
                      suffix="ms"
                      min={100}
                      max={30000}
                      step={100}
                      onChange={(steamRatingsDelayMs) => settings.setSettings({ steamRatingsDelayMs })}
                    />
                    <NumberSetting
                      label={t("settings.steamRatingsCooldown")}
                      value={settings.steamRatingsCooldownMinutes ?? 5}
                      suffix="min"
                      min={1}
                      max={60}
                      step={1}
                      onChange={(steamRatingsCooldownMinutes) => settings.setSettings({ steamRatingsCooldownMinutes })}
                    />
                    <NumberSetting
                      label={t("settings.hltbBatchDelay")}
                      value={settings.hltbBatchDelayMs ?? 500}
                      suffix="ms"
                      min={100}
                      max={30000}
                      step={100}
                      onChange={(hltbBatchDelayMs) => settings.setSettings({ hltbBatchDelayMs })}
                    />
                    <NumberSetting
                      label={t("settings.achievementsBatchDelay")}
                      value={settings.achievementsBatchDelayMs ?? 300}
                      suffix="ms"
                      min={100}
                      max={30000}
                      step={100}
                      onChange={(achievementsBatchDelayMs) => settings.setSettings({ achievementsBatchDelayMs })}
                    />
                  </div>
                  <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-3">
                    <div className="mb-3 flex items-start gap-3">
                      <CloudArrowDown size={15} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-accent" />
                      <div className="min-w-0">
                        <p className="text-sm text-repressurizer-text">{t("settings.libraryRefreshCacheMode")}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                          {t("settings.libraryRefreshCacheMode.desc")}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {LIBRARY_REFRESH_CACHE_OPTIONS.map((option) => {
                        const active = (settings.libraryRefreshCacheMode ?? "full") === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => settings.setSettings({
                              libraryRefreshCacheMode: option.value,
                              autoFetchDetailsOnRefresh: option.value !== "none",
                              autoFetchHltbOnRefresh: option.value !== "none",
                            })}
                            className={`btn-press rounded-lg border px-3 py-2 text-left transition-colors ${
                              active
                                ? "border-repressurizer-accent bg-repressurizer-accent/10"
                                : "border-repressurizer-border-subtle bg-repressurizer-bg hover:border-repressurizer-border"
                            }`}
                          >
                            <span className={`block text-xs font-medium ${active ? "text-repressurizer-accent" : "text-repressurizer-text"}`}>
                              {t(option.labelKey)}
                            </span>
                            <span className="mt-1 block text-[10px] leading-snug text-repressurizer-text-faint">
                              {t(option.descriptionKey)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-repressurizer-text">{t("settings.proxyRouting")}</p>
                      <p className="mt-0.5 text-xs text-repressurizer-text-faint">
                        {t("settings.proxyRouting.desc")}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.proxySettings.enabled}
                      onChange={(e) => updateProxySettings({ enabled: e.target.checked })}
                      className="h-4 w-4 accent-repressurizer-accent"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-xs text-repressurizer-text-faint">{t("settings.proxyRotationMode")}</p>
                      <SelectMenu
                        ariaLabel={t("settings.proxyRotationMode")}
                        value={settings.proxySettings.mode}
                        onChange={(mode) => updateProxySettings({ mode: mode as ProxyRotationMode })}
                        size="sm"
                        className="w-full"
                        options={[
                          { value: "fixed", label: t("settings.proxyMode.fixed") },
                          { value: "roundRobin", label: t("settings.proxyMode.roundRobin") },
                          { value: "batch", label: t("settings.proxyMode.batch") },
                          { value: "random", label: t("settings.proxyMode.random") },
                        ]}
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs text-repressurizer-text-faint">{t("settings.proxyFixedProfile")}</p>
                      <SelectMenu
                        ariaLabel={t("settings.proxyFixedProfile")}
                        value={settings.proxySettings.activeProfileId}
                        onChange={(activeProfileId) => updateProxySettings({ activeProfileId })}
                        size="sm"
                        className="w-full"
                        options={[
                          { value: "", label: t("settings.proxyFirstEnabled") },
                          ...settings.proxySettings.profiles.map((profile) => ({
                            value: profile.id,
                            label: profile.name || profile.host || profile.id,
                          })),
                        ]}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      ["steamApi", t("settings.proxyScope.steamApi")],
                      ["steamStore", t("settings.proxyScope.steamStore")],
                      ["hltb", t("settings.proxyScope.hltb")],
                      ["automation", t("settings.proxyScope.automation")],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
                        <span className="text-xs text-repressurizer-text-muted">{label}</span>
                        <input
                          type="checkbox"
                          checked={settings.proxySettings.scopes[key]}
                          onChange={(e) => updateProxySettings({
                            scopes: { ...settings.proxySettings.scopes, [key]: e.target.checked },
                          })}
                          className="h-4 w-4 accent-repressurizer-accent"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {settings.proxySettings.profiles.map((profile) => (
                      <div key={profile.id} className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <input
                            value={profile.name}
                            onChange={(e) => updateProxyProfile(profile.id, { name: e.target.value })}
                            placeholder={t("settings.proxyName.placeholder")}
                            className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                          <label className="flex items-center gap-1.5 text-xs text-repressurizer-text-muted">
                            <input
                              type="checkbox"
                              checked={profile.enabled}
                              onChange={(e) => updateProxyProfile(profile.id, { enabled: e.target.checked })}
                              className="h-4 w-4 accent-repressurizer-accent"
                            />
                            {t("settings.proxy.enabled")}
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveProxyProfile(profile.id)}
                            className="rounded-lg p-1.5 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"
                          >
                            <TrashSimple size={14} />
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[110px_1fr_90px_90px]">
                          <SelectMenu
                            ariaLabel={t("settings.proxyType")}
                            value={profile.type}
                            onChange={(type) => updateProxyProfile(profile.id, { type: type as ProxyType })}
                            size="sm"
                            className="w-full"
                            options={[
                              { value: "http", label: "HTTP" },
                              { value: "https", label: "HTTPS" },
                              { value: "socks5", label: "SOCKS5" },
                            ]}
                          />
                          <input
                            value={profile.host}
                            onChange={(e) => updateProxyProfile(profile.id, { host: e.target.value })}
                            placeholder={t("settings.proxyHost.placeholder")}
                            className="min-w-0 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                          <input
                            type="number"
                            min={1}
                            max={65535}
                            value={profile.port}
                            onChange={(e) => updateProxyProfile(profile.id, {
                              port: clampIntegerInput(e.target.value, profile.port || 8080, 1, 65535),
                            })}
                            placeholder={t("settings.proxyPort.placeholder")}
                            className="rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={profile.batchSize}
                            onChange={(e) => updateProxyProfile(profile.id, {
                              batchSize: clampIntegerInput(e.target.value, profile.batchSize || 1, 1, 100),
                            })}
                            title={t("settings.proxyBatch.title")}
                            className="rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <input
                            value={profile.username}
                            onChange={(e) => updateProxyProfile(profile.id, { username: e.target.value })}
                            placeholder={t("settings.proxyUsername.placeholder")}
                            className="rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                          <input
                            type="password"
                            value={profile.password}
                            onChange={(e) => updateProxyProfile(profile.id, { password: e.target.value })}
                            placeholder={t("settings.proxyPassword.placeholder")}
                            className="rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className={`min-w-0 truncate text-xs ${
                            profile.lastTestStatus === "ok"
                              ? "text-repressurizer-accent"
                              : profile.lastTestStatus === "failed"
                                ? "text-repressurizer-danger"
                                : "text-repressurizer-text-faint"
                          }`}>
                            {profile.lastTestMessage
                              ? `${profile.lastTestMessage}${profile.lastTestLatencyMs ? ` · ${profile.lastTestLatencyMs}ms` : ""}`
                              : t("settings.proxy.notTested")}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleTestProxyProfile(profile)}
                            disabled={testingProxyId === profile.id}
                            className="btn-press rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent disabled:opacity-50"
                          >
                            {testingProxyId === profile.id ? t("settings.proxy.testing") : t("settings.proxy.test")}
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddProxyProfile}
                      className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border px-3 py-2 text-sm text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
                    >
                      <Plus size={14} />
                      {t("settings.proxy.add")}
                    </button>
                  </div>
                </div>
              </div>
  );
}

