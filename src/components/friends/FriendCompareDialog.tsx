import { useState, useMemo } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useFriendsStore } from "../../stores/friendsStore";
import { fetchLibrary, resolveVanityUrl, fetchPlayerSummary, fetchFriendList } from "../../lib/tauri";
import type { OwnedGame } from "../../lib/types";
import { X, UsersThree, MagnifyingGlass, ArrowsClockwise } from "@phosphor-icons/react";
import { SteamImage } from "../games/SteamImage";
import { useT } from "../../lib/i18n";

interface FriendCompareDialogProps {
  onClose: () => void;
}

type Section = "both" | "only-me" | "only-them";

export function FriendCompareDialog({ onClose }: FriendCompareDialogProps) {
  const t = useT();
  const myGames = useGameStore((s) => s.games);
  const { apiKey, steamId64 } = useSettingsStore();
  const { friends, saveFriend, saveFriends, removeFriend } = useFriendsStore();

  const [input, setInput] = useState("");
  const [friendGames, setFriendGames] = useState<OwnedGame[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("both");
  const [search, setSearch] = useState("");
  const [currentFriendId, setCurrentFriendId] = useState("");
  const [importingFriends, setImportingFriends] = useState(false);

  const resolveAndFetch = async (rawInput: string): Promise<{ id: string; games: OwnedGame[] }> => {
    let friendId = rawInput.trim();
    if (!/^\d{17}$/.test(friendId)) {
      const profileMatch = friendId.match(/\/profiles\/(\d{17})/);
      if (profileMatch) {
        friendId = profileMatch[1];
      } else {
        const vanityMatch = friendId.match(/\/id\/([^/]+)/);
        const vanityName = (vanityMatch ? vanityMatch[1] : friendId).replace(/\/$/, "");
        friendId = await resolveVanityUrl(apiKey, vanityName);
      }
    }
    const games = await fetchLibrary(apiKey, friendId);
    return { id: friendId, games };
  };

  const handleCompare = async () => {
    if (!input.trim()) return;
    if (!apiKey) {
      setError(t("friends.apiKeyRequired"));
      return;
    }
    setLoading(true);
    setError("");
    setFriendGames(null);
    try {
      const { id, games } = await resolveAndFetch(input);
      setFriendGames(games);
      setCurrentFriendId(id);
      // Fetch real Steam display name
      let displayName = `Friend #${id.slice(-6)}`;
      let avatar: string | undefined;
      try {
        const summary = await fetchPlayerSummary(apiKey, id);
        displayName = summary.personaname;
        avatar = summary.avatar;
      } catch {}
      saveFriend({
        steamId64: id,
        displayName,
        avatar,
        lastCompared: Date.now(),
        gameCount: games.length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFriend = async (steamId64: string) => {
    if (!apiKey) {
      setError(t("friends.apiKeyRequired"));
      return;
    }
    setInput(steamId64);
    setLoading(true);
    setError("");
    setFriendGames(null);
    try {
      const games = await fetchLibrary(apiKey, steamId64);
      setFriendGames(games);
      setCurrentFriendId(steamId64);
      // Use existing name or fetch from Steam
      const existing = friends.find((f) => f.steamId64 === steamId64);
      let displayName = existing?.displayName ?? `Friend #${steamId64.slice(-6)}`;
      let avatar = existing?.avatar;
      if (!existing || existing.displayName.startsWith("Friend #")) {
        try {
          const summary = await fetchPlayerSummary(apiKey, steamId64);
          displayName = summary.personaname;
          avatar = summary.avatar;
        } catch {}
      }
      saveFriend({
        steamId64,
        displayName,
        avatar,
        lastCompared: Date.now(),
        gameCount: games.length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleForceRefresh = () => {
    if (currentFriendId) {
      handleSelectFriend(currentFriendId);
    }
  };

  const handleImportFriends = async () => {
    if (!apiKey || !steamId64) {
      setError(t("friends.apiKeyRequired"));
      return;
    }
    setImportingFriends(true);
    setError("");
    try {
      const imported = await fetchFriendList(apiKey, steamId64);
      saveFriends(imported.map((friend) => ({
        steamId64: friend.steamid,
        displayName: friend.personaname || `Friend #${friend.steamid.slice(-6)}`,
        avatar: friend.avatar,
        lastCompared: 0,
        gameCount: 0,
      })));
      if (imported.length === 0) {
        setError(t("friends.importEmpty"));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setImportingFriends(false);
    }
  };

  const { both, onlyMe, onlyThem } = useMemo(() => {
    if (!friendGames) return { both: [], onlyMe: [], onlyThem: [] };
    const myMap = myGames;
    const friendMap: Record<number, OwnedGame> = {};
    for (const g of friendGames) friendMap[g.appid] = g;

    const myIds = new Set(Object.keys(myMap).map(Number));
    const friendIds = new Set(friendGames.map((g) => g.appid));

    const both: Array<{ mine: OwnedGame; theirs: OwnedGame }> = [];
    const onlyMe: OwnedGame[] = [];
    const onlyThem: OwnedGame[] = [];

    for (const id of myIds) {
      if (friendIds.has(id)) {
        both.push({ mine: myMap[id], theirs: friendMap[id] });
      } else {
        onlyMe.push(myMap[id]);
      }
    }
    for (const id of friendIds) {
      if (!myIds.has(id)) onlyThem.push(friendMap[id]);
    }

    both.sort((a, b) => (b.mine.playtime_forever + b.theirs.playtime_forever) - (a.mine.playtime_forever + a.theirs.playtime_forever));
    onlyMe.sort((a, b) => b.playtime_forever - a.playtime_forever);
    onlyThem.sort((a, b) => b.playtime_forever - a.playtime_forever);

    return { both, onlyMe, onlyThem };
  }, [friendGames, myGames]);

  const filterGame = (name: string) => {
    if (!search.trim()) return true;
    return name.toLowerCase().includes(search.trim().toLowerCase());
  };

  const sectionLabel: Record<Section, string> = {
    both: t("friends.bothOwn", { count: both.length }),
    "only-me": t("friends.onlyMe", { count: onlyMe.length }),
    "only-them": t("friends.onlyThem", { count: onlyThem.length }),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-16 pb-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex h-full w-full max-w-2xl flex-col rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <UsersThree size={18} className="text-repressurizer-accent" weight="fill" />
            <h2 className="text-base font-semibold text-white">{t("friends.title")}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Input */}
        <div className="border-b border-repressurizer-border-subtle px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCompare()}
              placeholder={t("friends.inputPlaceholder")}
              className="flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
            />
            <button
              onClick={handleCompare}
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-accent px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-40"
            >
              <ArrowsClockwise size={14} className={loading ? "animate-spin" : ""} />
              {t("friends.compare")}
            </button>
            <button
              onClick={handleImportFriends}
              disabled={importingFriends || !apiKey || !steamId64}
              className="inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm font-medium text-repressurizer-text-muted transition-colors hover:text-white disabled:opacity-40"
            >
              <UsersThree size={14} className={importingFriends ? "animate-pulse" : ""} />
              {importingFriends ? t("friends.importing") : t("friends.import")}
            </button>
          </div>
          {error && <p className="text-xs text-repressurizer-danger">{error}</p>}

          {/* Saved friends */}
          {friends.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {friends.map((f) => (
                <div
                  key={f.steamId64}
                  className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    currentFriendId === f.steamId64
                      ? "border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent"
                      : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:text-repressurizer-text hover:border-repressurizer-border"
                  }`}
                >
                  {f.avatar && (
                    <img src={f.avatar} alt="" className="h-4 w-4 rounded-full shrink-0" />
                  )}
                  <button
                    onClick={() => handleSelectFriend(f.steamId64)}
                    disabled={loading}
                    className="truncate max-w-[120px] disabled:opacity-40"
                    title={`${f.displayName} (${f.gameCount} games)`}
                  >
                    {f.displayName}
                  </button>
                  <span className="text-[10px] text-repressurizer-text-faint font-mono tabular-nums">{f.gameCount}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFriend(f.steamId64); }}
                    className="opacity-0 group-hover:opacity-100 text-repressurizer-text-faint hover:text-repressurizer-danger transition-all"
                    title={t("friends.remove")}
                  >
                    <X size={10} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs + Search + Force Refresh */}
        {friendGames && (
          <div className="flex items-center gap-2 border-b border-repressurizer-border-subtle px-4 py-2">
            {(["both", "only-me", "only-them"] as Section[]).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  section === s
                    ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                    : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:text-repressurizer-text"
                }`}
              >
                {sectionLabel[s]}
              </button>
            ))}
            <button
              onClick={handleForceRefresh}
              disabled={loading}
              className="rounded-lg border border-repressurizer-border-subtle px-2 py-1 text-[11px] text-repressurizer-text-muted hover:text-white transition-colors disabled:opacity-40"
              title={t("friends.forceRefresh")}
            >
              <ArrowsClockwise size={12} className={loading ? "animate-spin" : ""} />
            </button>
            <div className="ml-auto flex items-center gap-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1">
              <MagnifyingGlass size={12} className="text-repressurizer-text-faint" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("friends.filter")}
                className="w-28 bg-transparent text-[11px] text-repressurizer-text placeholder:text-repressurizer-text-faint focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {!friendGames && !loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-repressurizer-text-faint">
              <UsersThree size={40} weight="duotone" className="opacity-30" />
              <p className="text-sm">{t("friends.empty")}</p>
              {friends.length > 0 && (
                <p className="text-xs">{t("friends.empty.saved")}</p>
              )}
            </div>
          )}

          {friendGames && section === "both" && (
            <div className="divide-y divide-repressurizer-border-subtle">
              {both.filter((r) => filterGame(String(r.mine.name ?? ""))).map(({ mine, theirs }) => (
                <div key={mine.appid} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="h-8 w-14 shrink-0 overflow-hidden rounded-md bg-repressurizer-bg">
                    <SteamImage appId={mine.appid} alt="" kind="header" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{String(mine.name ?? "")}</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
                    <span className="text-repressurizer-accent">{(mine.playtime_forever / 60).toFixed(1)}h</span>
                    <span className="text-repressurizer-text-faint">{t("friends.vs")}</span>
                    <span className="text-repressurizer-text-muted">{(theirs.playtime_forever / 60).toFixed(1)}h</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {friendGames && section === "only-me" && (
            <div className="divide-y divide-repressurizer-border-subtle">
              {onlyMe.filter((g) => filterGame(String(g.name ?? ""))).map((g) => (
                <GameRow key={g.appid} game={g} />
              ))}
            </div>
          )}

          {friendGames && section === "only-them" && (
            <div className="divide-y divide-repressurizer-border-subtle">
              {onlyThem.filter((g) => filterGame(String(g.name ?? ""))).map((g) => (
                <GameRow key={g.appid} game={g} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GameRow({ game }: { game: OwnedGame }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="h-8 w-14 shrink-0 overflow-hidden rounded-md bg-repressurizer-bg">
        <SteamImage appId={game.appid} alt="" kind="header" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{String(game.name ?? "")}</p>
      </div>
      <span className="text-[11px] font-mono tabular-nums text-repressurizer-text-muted">
        {(game.playtime_forever / 60).toFixed(1)}h
      </span>
    </div>
  );
}
