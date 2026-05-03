import { useEffect, useState, type ClipboardEvent } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useT } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { useFamilyStore } from "../../stores/familyStore";
import { familyAppsToOwnedGames } from "../../lib/familyLibrary";
import { fetchFamilyLibrary, type FamilyLibraryResult } from "../../lib/tauri";
import {
  extractStoreWebApiToken,
  loadSteamFamilyToken,
  saveSteamFamilyToken,
} from "../../lib/steamFamilyToken";
import {
  GameController,
  Sidebar as SidebarIcon,
  MagnifyingGlass,
  Wrench,
  Rocket,
  UsersThree,
  Globe,
  Spinner,
  CheckCircle,
  Warning,
  Key,
} from "@phosphor-icons/react";

interface OnboardingTourProps {
  onComplete: () => void;
}

const STEPS = [
  { id: "welcome", icon: GameController, titleKey: "onboarding.welcome", descKey: "onboarding.welcome.desc", color: "text-repressurizer-accent" },
  { id: "sidebar", icon: SidebarIcon, titleKey: "onboarding.sidebar", descKey: "onboarding.sidebar.desc", color: "text-sky-400" },
  { id: "search", icon: MagnifyingGlass, titleKey: "onboarding.search", descKey: "onboarding.search.desc", color: "text-violet-400" },
  { id: "family", icon: UsersThree, titleKey: "onboarding.family", descKey: "onboarding.family.desc", color: "text-sky-300" },
  { id: "tools", icon: Wrench, titleKey: "onboarding.tools", descKey: "onboarding.tools.desc", color: "text-amber-400" },
  { id: "done", icon: Rocket, titleKey: "onboarding.done", descKey: "onboarding.done.desc", color: "text-repressurizer-accent" },
] as const;

type FamilyProbeStatus = "idle" | "checking" | "ready" | "needs-token" | "not-member" | "error";

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const [familyProbeStarted, setFamilyProbeStarted] = useState(false);
  const [familyStatus, setFamilyStatus] = useState<FamilyProbeStatus>("idle");
  const [familyMessage, setFamilyMessage] = useState("");
  const [familyToken, setFamilyToken] = useState("");
  const [familyResult, setFamilyResult] = useState<FamilyLibraryResult | null>(null);
  const t = useT();
  const settings = useSettingsStore();
  const mergeGames = useGameStore((s) => s.mergeGames);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const isFamilyStep = current.id === "family";

  const runFamilyProbe = async (fromAuto = false) => {
    setFamilyStatus("checking");
    setFamilyMessage(fromAuto ? "Checking saved Steam Family access..." : "Checking Steam Family...");
    setFamilyResult(null);

    try {
      const saved = await loadSteamFamilyToken();
      const accessToken = extractStoreWebApiToken(familyToken || saved?.accessToken || "");
      if (accessToken && accessToken !== familyToken) {
        setFamilyToken(accessToken);
      }

      if (!settings.apiKey && !accessToken) {
        setFamilyStatus("needs-token");
        setFamilyMessage("Steam Family usually needs the Steam Store webapi_token. Open the token page, copy the JSON, paste it here, then retry.");
        return;
      }

      if (accessToken) {
        await saveSteamFamilyToken(accessToken, false);
      }

      const result = await fetchFamilyLibrary(
        settings.apiKey,
        accessToken || undefined,
        settings.steamId64 || undefined,
        settings.includeSteamFamilyNonGames ?? false
      );

      setFamilyResult(result);
      useFamilyStore.getState().setResult(result);
      mergeGames(familyAppsToOwnedGames(result.apps));
      if (accessToken && result.auth_used === "access_token") {
        await saveSteamFamilyToken(accessToken, true);
      }

      setFamilyStatus("ready");
      setFamilyMessage(
        result.shared_apps > 0
          ? `Steam Family ready: ${result.shared_apps} shared game${result.shared_apps === 1 ? "" : "s"} found.`
          : "Steam Family checked. No shared games were returned for this account."
      );
    } catch (error) {
      const text = String(error);
      if (text.toLowerCase().includes("not a member")) {
        setFamilyStatus("not-member");
        setFamilyMessage("This Steam account does not look like a member of a Steam Family group.");
        return;
      }

      if (!extractStoreWebApiToken(familyToken)) {
        setFamilyStatus("needs-token");
        setFamilyMessage("Steam rejected the normal Web API key for Family data. Paste the Steam Store webapi_token and retry.");
        return;
      }

      setFamilyStatus("error");
      setFamilyMessage(`Steam Family check failed: ${text}`);
    }
  };

  useEffect(() => {
    if (!isFamilyStep || familyProbeStarted) return;
    setFamilyProbeStarted(true);
    runFamilyProbe(true);
  }, [isFamilyStep, familyProbeStarted]);

  const handleFamilyTokenPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    const token = extractStoreWebApiToken(pasted);
    if (token && token !== pasted.trim()) {
      event.preventDefault();
      setFamilyToken(token);
      setFamilyStatus("idle");
      setFamilyMessage("Steam Store token extracted from pasted JSON.");
    }
  };

  const handleOpenTokenPage = async () => {
    await open("https://store.steampowered.com/pointssummary/ajaxgetasyncconfig");
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface p-8 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        {/* Progress dots */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-repressurizer-accent" : i < step ? "w-1.5 bg-repressurizer-accent/50" : "w-1.5 bg-repressurizer-border"
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-repressurizer-bg ${current.color}`}>
            <Icon size={32} weight="duotone" />
          </div>
        </div>

        {/* Content */}
        <h2 className="text-center text-lg font-semibold text-white tracking-tight mb-2">
          {t(current.titleKey as any)}
        </h2>
        <p className="text-center text-sm text-repressurizer-text-muted leading-relaxed mb-8">
          {t(current.descKey as any)}
        </p>

        {isFamilyStep && (
          <div className="mb-6 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-left">
            <div className="flex items-start gap-3">
              {familyStatus === "checking" ? (
                <Spinner size={17} className="mt-0.5 shrink-0 animate-spin text-sky-300" />
              ) : familyStatus === "ready" ? (
                <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0 text-repressurizer-success" />
              ) : familyStatus === "not-member" ? (
                <CheckCircle size={17} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-text-faint" />
              ) : (
                <Warning size={17} weight="duotone" className="mt-0.5 shrink-0 text-amber-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-repressurizer-text">
                  {familyStatus === "ready" ? "Family library connected" : familyStatus === "checking" ? "Detecting Family access" : "Family setup optional"}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                  {familyMessage || "Repressurizer can show games available through Steam Family when Steam allows access."}
                </p>
              </div>
            </div>

            {familyResult && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <MiniFamilyStat label="Shared" value={familyResult.shared_apps} />
                <MiniFamilyStat label="Owned" value={familyResult.owned_apps} />
                <MiniFamilyStat label="Hidden" value={familyResult.non_game_apps} />
              </div>
            )}

            {familyStatus !== "ready" && familyStatus !== "not-member" && (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <Key size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint" />
                  <input
                    type="password"
                    value={familyToken}
                    onChange={(e) => setFamilyToken(e.target.value)}
                    onPaste={handleFamilyTokenPaste}
                    placeholder="Paste webapi_token or Steam JSON"
                    className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 pl-9 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleOpenTokenPage}
                    className="btn-press inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
                  >
                    <Globe size={13} />
                    Open token page
                  </button>
                  <button
                    onClick={() => runFamilyProbe(false)}
                    disabled={familyStatus === "checking" || (!settings.apiKey && !extractStoreWebApiToken(familyToken))}
                    className="btn-press flex-1 rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-300 disabled:opacity-40"
                  >
                    Retry probe
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={onComplete}
            className="text-xs text-repressurizer-text-faint hover:text-repressurizer-text-muted transition-colors"
          >
            {t("onboarding.skip")}
          </button>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="btn-press rounded-lg border border-repressurizer-border px-4 py-2 text-sm text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"
              >
                {t("onboarding.prev")}
              </button>
            )}
            <button
              onClick={() => isLast ? onComplete() : setStep(step + 1)}
              className="btn-press rounded-lg bg-repressurizer-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
            >
              {isLast ? t("onboarding.finish") : t("onboarding.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniFamilyStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-2 py-1.5">
      <p className="font-mono text-sm font-semibold text-repressurizer-text tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</p>
    </div>
  );
}
