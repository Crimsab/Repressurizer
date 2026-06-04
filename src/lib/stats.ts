import type { OwnedGame, GameDetails, SteamCollection } from "./types";
import { isPlausibleSteamPrice } from "./prices";

export interface LibraryStats {
  totalGames: number;
  totalPlaytimeMinutes: number;
  totalPlaytimeHours: number;
  unplayedCount: number;
  unplayedPercent: number;
  averageHoursPerGame: number;
  topPlayed: { name: string; hours: number }[];
  playtimeBuckets: { label: string; count: number }[];
  categoryStats: { name: string; count: number; isDynamic: boolean }[];
  // Value stats
  libraryValue: number; // total in cents (initial prices)
  libraryValueCurrent: number; // total in cents (current prices)
  freeGamesCount: number;
  pricedGamesCount: number;
  // Genre stats
  topGenres: { name: string; count: number }[];
  // Platform stats
  platformCounts: { windows: number; mac: number; linux: number };
  // Metacritic stats
  averageMetacritic: number;
  metacriticCount: number;
  // Release decade stats
  releaseDecades: { label: string; count: number }[];
  // Top publishers
  topPublishers: { name: string; count: number }[];
  // Cost per hour (best value games)
  bestCostPerHour: { name: string; costPerHour: number; hours: number; price: number }[];
  // Shame wall (most expensive unplayed games)
  shameWall: { name: string; price: number }[];
}

const PLAYTIME_BUCKETS = [
  { label: "Unplayed (0h)", min: 0, max: 0 },
  { label: "< 1h", min: 0.01, max: 1 },
  { label: "1-10h", min: 1, max: 10 },
  { label: "10-50h", min: 10, max: 50 },
  { label: "50-100h", min: 50, max: 100 },
  { label: "100-500h", min: 100, max: 500 },
  { label: "500h+", min: 500, max: Infinity },
];

export function computeStats(
  games: Record<number, OwnedGame>,
  collections: SteamCollection[],
  details: Record<number, GameDetails> = {}
): LibraryStats {
  const list = Object.values(games);
  const totalGames = list.length;
  const totalPlaytimeMinutes = list.reduce((s, g) => s + g.playtime_forever, 0);
  const totalPlaytimeHours = Math.round((totalPlaytimeMinutes / 60) * 10) / 10;
  const unplayedCount = list.filter((g) => g.playtime_forever === 0).length;
  const unplayedPercent = totalGames > 0 ? Math.round((unplayedCount / totalGames) * 1000) / 10 : 0;
  const averageHoursPerGame = totalGames > 0 ? Math.round((totalPlaytimeHours / totalGames) * 10) / 10 : 0;

  const topPlayed = [...list]
    .sort((a, b) => b.playtime_forever - a.playtime_forever)
    .slice(0, 10)
    .map((g) => ({
      name: String(g.name ?? ""),
      hours: Math.round((g.playtime_forever / 60) * 10) / 10,
    }));

  const playtimeBuckets = PLAYTIME_BUCKETS.map((bucket) => {
    const count = list.filter((g) => {
      const h = g.playtime_forever / 60;
      if (bucket.max === 0) return h === 0;
      return h > bucket.min && (bucket.max === Infinity ? true : h <= bucket.max);
    }).length;
    return { label: bucket.label, count };
  });

  const categoryStats = collections
    .filter((c) => c.id !== "hidden")
    .map((c) => ({ name: c.name, count: c.added.length, isDynamic: c.is_dynamic }))
    .sort((a, b) => b.count - a.count);

  // === Stats from cached details ===
  const detailsList = Object.values(details);

  // Library value
  let libraryValue = 0;
  let libraryValueCurrent = 0;
  let freeGamesCount = 0;
  let pricedGamesCount = 0;
  for (const d of detailsList) {
    if (d.is_free) {
      freeGamesCount++;
    } else if (isPlausibleSteamPrice(d.price_initial)) {
      libraryValue += d.price_initial;
      libraryValueCurrent += isPlausibleSteamPrice(d.price_final) ? d.price_final : d.price_initial;
      pricedGamesCount++;
    }
  }

  // Genre distribution
  const genreCounts = new Map<string, number>();
  for (const d of detailsList) {
    for (const g of d.genres) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    }
  }
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Platform support
  const platformCounts = { windows: 0, mac: 0, linux: 0 };
  for (const d of detailsList) {
    if (d.platforms.windows) platformCounts.windows++;
    if (d.platforms.mac) platformCounts.mac++;
    if (d.platforms.linux) platformCounts.linux++;
  }

  // Metacritic average
  let metacriticSum = 0;
  let metacriticCount = 0;
  for (const d of detailsList) {
    if (d.metacritic_score != null) {
      metacriticSum += d.metacritic_score;
      metacriticCount++;
    }
  }
  const averageMetacritic = metacriticCount > 0 ? Math.round(metacriticSum / metacriticCount) : 0;

  // Release decade distribution
  const decadeCounts = new Map<string, number>();
  for (const d of detailsList) {
    if (d.release_date) {
      const match = d.release_date.match(/\b(19|20)\d{2}\b/);
      if (match) {
        const year = parseInt(match[0]);
        const decade = `${Math.floor(year / 10) * 10}s`;
        decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
      }
    }
  }
  const releaseDecades = [...decadeCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));

  // Top publishers
  const pubCounts = new Map<string, number>();
  for (const d of detailsList) {
    for (const p of d.publishers) {
      if (p) pubCounts.set(p, (pubCounts.get(p) ?? 0) + 1);
    }
  }
  const topPublishers = [...pubCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Cost per hour — games with price and >1h played, sorted by lowest cost/hour
  const costPerHourList: { name: string; costPerHour: number; hours: number; price: number }[] = [];
  for (const g of list) {
    const d = details[g.appid];
    if (!d || d.is_free || !isPlausibleSteamPrice(d.price_initial)) continue;
    const hours = g.playtime_forever / 60;
    if (hours < 1) continue;
    const priceEur = d.price_initial / 100;
    costPerHourList.push({
      name: String(g.name ?? ""),
      costPerHour: Math.round((priceEur / hours) * 100) / 100,
      hours: Math.round(hours * 10) / 10,
      price: d.price_initial,
    });
  }
  const bestCostPerHour = costPerHourList
    .sort((a, b) => a.costPerHour - b.costPerHour)
    .slice(0, 10);

  // Shame wall — most expensive games with 0 playtime
  const shameWall = list
    .filter((g) => {
      if (g.playtime_forever > 0) return false;
      const d = details[g.appid];
      return d && !d.is_free && isPlausibleSteamPrice(d.price_initial) && d.price_initial > 0;
    })
    .map((g) => ({
      name: String(g.name ?? ""),
      price: details[g.appid].price_initial!,
    }))
    .sort((a, b) => b.price - a.price)
    .slice(0, 10);

  return {
    totalGames,
    totalPlaytimeMinutes,
    totalPlaytimeHours,
    unplayedCount,
    unplayedPercent,
    averageHoursPerGame,
    topPlayed,
    playtimeBuckets,
    categoryStats,
    libraryValue,
    libraryValueCurrent,
    freeGamesCount,
    pricedGamesCount,
    topGenres,
    platformCounts,
    averageMetacritic,
    metacriticCount,
    releaseDecades,
    topPublishers,
    bestCostPerHour,
    shameWall,
  };
}
