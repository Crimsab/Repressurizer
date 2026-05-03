import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import {
  detectSteam,
  detectSteamAt,
  fetchLibrary,
  loadCollections,
} from "../../lib/tauri";
import type { SteamUser } from "../../lib/types";
import {
  GameController,
  MagnifyingGlass,
  Folder,
  Key,
  ArrowRight,
  Spinner,
  CheckCircle,
  User,
} from "@phosphor-icons/react";

export function SetupWizard() {
  const setSettings = useSettingsStore((s) => s.setSettings);
  const setGames = useGameStore((s) => s.setGames);
  const setCollections = useCategoryStore((s) => s.setCollections);

  const [step, setStep] = useState(0);
  const [steamPath, setSteamPath] = useState("");
  const [users, setUsers] = useState<SteamUser[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [steamId64, setSteamId64] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDetect = async () => {
    setLoading(true);
    setError("");
    try {
      const info = await detectSteam();
      setSteamPath(info.steam_path);
      setUsers(info.users);
      if (info.users.length === 1) {
        setSelectedUser(info.users[0].id3);
        setSteamId64(info.users[0].id64);
      }
      setStep(1);
    } catch (e) {
      setError(`Failed to detect Steam: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    setError("");
    try {
      console.log("Fetching library for", steamId64);
      const games = await fetchLibrary(apiKey, steamId64);
      console.log("Got games:", games.length);

      console.log("Loading collections for", selectedUser);
      const collections = await loadCollections(steamPath, selectedUser);
      console.log("Got collections:", collections.length);

      setGames(games);
      setCollections(collections);
      setSettings({
        steamPath,
        steamId3: selectedUser,
        steamId64,
        apiKey,
        setupComplete: true,
      });
    } catch (e) {
      console.error("Setup error:", e);
      setError(`${e}`);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-repressurizer-bg p-8">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Branding */}
        <div className="mb-8 text-center">
          <GameController size={48} weight="duotone" className="mx-auto mb-3 text-repressurizer-accent" />
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Repressurizer
          </h1>
          <p className="mt-1 text-sm text-repressurizer-text-muted">
            Steam Library Manager
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-repressurizer-border bg-repressurizer-surface p-8">
          {/* Progress indicator */}
          <div className="mb-6 flex items-center gap-2">
            <StepDot active={step >= 0} />
            <div className={`h-px flex-1 transition-colors ${step >= 1 ? "bg-repressurizer-accent" : "bg-repressurizer-border"}`} />
            <StepDot active={step >= 1} />
          </div>

          {error && (
            <div className="mb-5 rounded-xl bg-repressurizer-danger/8 border border-repressurizer-danger/20 p-3.5 text-sm text-repressurizer-danger">
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-medium text-white tracking-tight">Find Steam</h2>
                <p className="mt-1 text-sm text-repressurizer-text-muted">
                  We'll locate your Steam installation automatically.
                </p>
              </div>

              <button
                onClick={handleDetect}
                disabled={loading}
                className="btn-press flex w-full items-center justify-center gap-2 rounded-xl bg-repressurizer-accent px-4 py-3 font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-50"
              >
                {loading ? (
                  <Spinner size={18} className="animate-spin" />
                ) : (
                  <MagnifyingGlass size={18} weight="bold" />
                )}
                {loading ? "Detecting..." : "Auto-Detect Steam"}
              </button>

              <div className="flex items-center gap-3 text-xs text-repressurizer-text-faint">
                <div className="h-px flex-1 bg-repressurizer-border" />
                or enter path manually
                <div className="h-px flex-1 bg-repressurizer-border" />
              </div>

              <div className="relative">
                <Folder size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint pointer-events-none" />
                <input
                  type="text"
                  value={steamPath}
                  onChange={(e) => setSteamPath(e.target.value)}
                  placeholder="C:\Program Files (x86)\Steam"
                  className="w-full rounded-xl border border-repressurizer-border bg-repressurizer-bg pl-9 pr-4 py-2.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
                />
              </div>

              {steamPath && (
                <button
                  onClick={async () => {
                    setLoading(true);
                    setError("");
                    try {
                      const info = await detectSteamAt(steamPath);
                      setUsers(info.users);
                      if (info.users.length === 1) {
                        setSelectedUser(info.users[0].id3);
                        setSteamId64(info.users[0].id64);
                      }
                      setStep(1);
                    } catch (e) {
                      setError(`Invalid Steam path: ${e}`);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="btn-press flex w-full items-center justify-center gap-2 rounded-xl border border-repressurizer-border px-4 py-2.5 text-sm text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover disabled:opacity-50"
                >
                  {loading ? <Spinner size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  {loading ? "Checking..." : "Use this path"}
                </button>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              {/* Steam path (readonly) */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  Steam Path
                </label>
                <div className="rounded-lg bg-repressurizer-bg border border-repressurizer-border-subtle px-3.5 py-2 text-sm font-mono text-repressurizer-text-muted truncate">
                  {steamPath}
                </div>
              </div>

              {/* User selection */}
              {users.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                    Select User Profile
                  </label>
                  <div className="space-y-2">
                    {users.map((user) => (
                      <button
                        key={user.id3}
                        onClick={() => {
                          setSelectedUser(user.id3);
                          setSteamId64(user.id64);
                        }}
                        className={`btn-press w-full rounded-xl border px-4 py-3 text-left transition-all ${
                          selectedUser === user.id3
                            ? "border-repressurizer-accent bg-repressurizer-accent/8 ring-1 ring-repressurizer-accent/30"
                            : "border-repressurizer-border hover:bg-repressurizer-surface-hover"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            selectedUser === user.id3 ? "bg-repressurizer-accent/20 text-repressurizer-accent" : "bg-repressurizer-surface-raised text-repressurizer-text-faint"
                          }`}>
                            <User size={16} weight="fill" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-white">
                              {user.persona_name || `User ${user.id3}`}
                            </span>
                            <span className="block font-mono text-[11px] text-repressurizer-text-faint">
                              {user.id64}
                            </span>
                          </div>
                          {user.has_collections && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-repressurizer-success">
                              <CheckCircle size={12} weight="fill" />
                              collections
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Steam ID64 */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  Steam ID64
                </label>
                <input
                  type="text"
                  value={steamId64}
                  onChange={(e) => setSteamId64(e.target.value)}
                  placeholder="76561198..."
                  className="w-full rounded-xl border border-repressurizer-border bg-repressurizer-bg px-4 py-2.5 text-sm font-mono text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
                />
              </div>

              {/* API Key */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  Steam Web API Key
                </label>
                <div className="relative">
                  <Key size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint pointer-events-none" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Your API key"
                    className="w-full rounded-xl border border-repressurizer-border bg-repressurizer-bg pl-9 pr-4 py-2.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
                  />
                </div>
                <a
                  href="https://steamcommunity.com/dev/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block text-xs text-repressurizer-accent hover:text-repressurizer-accent-hover transition-colors"
                >
                  Get your API key here
                </a>
              </div>

              {/* Submit */}
              <button
                onClick={handleComplete}
                disabled={loading || !selectedUser || !steamId64 || !apiKey}
                className="btn-press flex w-full items-center justify-center gap-2 rounded-xl bg-repressurizer-accent px-4 py-3 font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <Spinner size={18} className="animate-spin" />
                    Loading library...
                  </>
                ) : (
                  <>
                    <ArrowRight size={18} weight="bold" />
                    Connect &amp; Load Library
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDot({ active }: { active: boolean }) {
  return (
    <div
      className={`h-2.5 w-2.5 rounded-full transition-all ${
        active ? "bg-repressurizer-accent shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-repressurizer-border"
      }`}
    />
  );
}
