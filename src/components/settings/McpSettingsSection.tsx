import { useState } from "react";
import {
  ChatText,
  CheckCircle,
  ClipboardText,
  CopySimple,
  GlobeHemisphereWest,
  MinusCircle,
  Robot,
  ShieldCheck,
  Stethoscope,
} from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";

const MCP_STARTER_PROMPT = `Use the Repressurizer MCP server to help with my Steam library. Start with get_library_context for a compact overview, or use library_summary and get_play_history separately. Then use search_games, get_game, list_collections, or recommend_games as needed. Treat play history as observed activity only: never invent a historical first-launch date. Follow the user's selected integration profile. Before any write, show the exact change and wait for explicit confirmation; never access arbitrary files, shell commands, or network resources.`;

export function McpSettingsSection() {
  const t = useT();
  const settings = useSettingsStore();
  const [copied, setCopied] = useState<"config" | "prompt" | null>(null);

  const copy = async (kind: "config" | "prompt", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1800);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="space-y-3">
      <McpToggleRow
        checked={settings.mcpEnabled}
        label={t("settings.mcp.enabled")}
        description={t("settings.mcp.enabled.desc")}
        enabledLabel={t("settings.integration.enabled")}
        disabledLabel={t("settings.integration.disabled")}
        onChange={(value) => settings.setSettings({ mcpEnabled: value })}
      />
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
        <div className="flex items-start gap-3">
          <ShieldCheck size={16} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-accent" />
          <div className="min-w-0 flex-1">
            <label htmlFor="mcp-permission-mode" className="text-sm text-repressurizer-text">
              {t("settings.mcp.permission")}
            </label>
            <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
              {t("settings.mcp.permission.desc")}
            </p>
            <select
              id="mcp-permission-mode"
              value={settings.mcpPermissionMode}
              onChange={(event) =>
                settings.setSettings({
                  mcpPermissionMode: event.target.value as typeof settings.mcpPermissionMode,
                })
              }
              className="mt-3 min-h-9 w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 text-xs text-repressurizer-text outline-none focus:border-repressurizer-accent sm:w-auto"
            >
              <option value="readOnly">{t("settings.mcp.permission.readOnly")}</option>
              <option value="manageLibrary">{t("settings.mcp.permission.manageLibrary")}</option>
              <option value="full">{t("settings.mcp.permission.full")}</option>
            </select>
            <p className="mt-2 text-xs leading-relaxed text-repressurizer-text-faint">
              {settings.mcpPermissionMode === "readOnly"
                ? t("settings.mcp.permission.readOnly.desc")
                : settings.mcpPermissionMode === "manageLibrary"
                  ? t("settings.mcp.permission.manageLibrary.desc")
                  : t("settings.mcp.permission.full.desc")}
            </p>
          </div>
        </div>
      </div>
      <McpToggleRow
        checked={settings.apiEnabled}
        label={t("settings.mcp.api")}
        description={t("settings.mcp.api.desc")}
        enabledLabel={t("settings.integration.enabled")}
        disabledLabel={t("settings.integration.disabled")}
        onChange={(value) => settings.setSettings({ apiEnabled: value })}
      />
      <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2.5">
        <div className="flex items-start gap-2">
          <GlobeHemisphereWest size={16} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-accent" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-repressurizer-text">{t("settings.mcp.api.command")}</p>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
              {t("settings.mcp.api.automatic")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-repressurizer-text-faint">
              {t("settings.mcp.api.note")}
            </p>
            <code className="mt-2 block break-all font-mono text-[11px] text-repressurizer-text-muted">
              repressurizer-cli api token
            </code>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2.5">
        <p className="text-xs font-medium text-repressurizer-text">
          {t("settings.mcp.command")}
        </p>
        <code className="mt-1 block break-all font-mono text-[11px] text-repressurizer-text-muted">
          repressurizer-mcp
        </code>
      </div>
      <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-3">
        <div className="flex items-start gap-2">
          <ClipboardText size={16} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-accent" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-repressurizer-text">{t("settings.mcp.setup")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
              {t("settings.mcp.setup.desc")}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 py-1.5 text-xs text-repressurizer-text-muted hover:border-repressurizer-accent hover:text-repressurizer-text"
            onClick={() => void copy("config", "repressurizer-cli mcp config")}
          >
            {copied === "config" ? <CheckCircle size={14} weight="fill" /> : <CopySimple size={14} />}
            {copied === "config" ? t("settings.mcp.copied") : t("settings.mcp.copyConfig")}
          </button>
          <button
            type="button"
            className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 py-1.5 text-xs text-repressurizer-text-muted hover:border-repressurizer-accent hover:text-repressurizer-text"
            onClick={() => void copy("prompt", MCP_STARTER_PROMPT)}
          >
            {copied === "prompt" ? <CheckCircle size={14} weight="fill" /> : <ChatText size={14} />}
            {copied === "prompt" ? t("settings.mcp.copied") : t("settings.mcp.copyPrompt")}
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Stethoscope size={16} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-text-muted" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-repressurizer-text">{t("settings.mcp.doctor")}</p>
            <code className="mt-1 block break-all font-mono text-[11px] text-repressurizer-text-muted">
              repressurizer-cli mcp doctor
            </code>
          </div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-repressurizer-text-faint">
        {t("settings.mcp.confirmation")}
      </p>
    </div>
  );
}

function McpToggleRow({
  checked,
  label,
  description,
  enabledLabel,
  disabledLabel,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  enabledLabel: string;
  disabledLabel: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 transition-colors ${
        checked
          ? "border-repressurizer-accent/60 bg-repressurizer-accent/5"
          : "border-repressurizer-border-subtle bg-repressurizer-bg"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Robot
            size={15}
            weight="duotone"
            aria-hidden="true"
            className={`mt-0.5 shrink-0 ${checked ? "text-repressurizer-accent" : "text-repressurizer-text-faint"}`}
          />
          <div className="min-w-0">
            <p className="text-sm text-repressurizer-text">{label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">{description}</p>
          </div>
        </div>
        <div
          role="group"
          aria-label={label}
          className="inline-flex w-full shrink-0 rounded-lg border border-repressurizer-border bg-repressurizer-bg p-0.5 sm:w-auto"
        >
          <button
            type="button"
            aria-pressed={!checked}
            onClick={() => onChange(false)}
            className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors sm:flex-none ${
              !checked
                ? "bg-repressurizer-surface text-repressurizer-text shadow-sm"
                : "text-repressurizer-text-faint hover:bg-repressurizer-surface/60 hover:text-repressurizer-text"
            }`}
          >
            <MinusCircle size={14} weight={!checked ? "fill" : "regular"} aria-hidden="true" />
            {disabledLabel}
          </button>
          <button
            type="button"
            aria-pressed={checked}
            onClick={() => onChange(true)}
            className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors sm:flex-none ${
              checked
                ? "bg-repressurizer-accent text-white shadow-sm"
                : "text-repressurizer-text-faint hover:bg-repressurizer-surface/60 hover:text-repressurizer-text"
            }`}
          >
            <CheckCircle size={14} weight={checked ? "fill" : "regular"} aria-hidden="true" />
            {enabledLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
