import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  fetchGameDetails,
  getCapsuleImageUrl,
  getHeaderImageUrl,
} from "../../lib/tauri";
import { scheduleOriginalReleaseDateFetch } from "../../lib/releaseDateQueue";

type SteamImageKind = "header" | "capsule";

interface SteamImageProps {
  appId: number;
  alt?: string;
  kind?: SteamImageKind;
  className?: string;
  loading?: "eager" | "lazy";
  draggable?: boolean;
}

const detailsRequests = new Set<number>();
const detailsFailures = new Map<number, number>();
const FAILURE_RETRY_MS = 60_000;

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

function guessedUrls(appId: number, kind: SteamImageKind): string[] {
  const file = kind === "capsule" ? "capsule_231x87.jpg" : "header.jpg";
  return [
    kind === "capsule" ? getCapsuleImageUrl(appId) : getHeaderImageUrl(appId),
    `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/${file}`,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/${file}`,
  ];
}

export function SteamImage({
  appId,
  alt = "",
  kind = "header",
  className,
  loading = "lazy",
  draggable = false,
}: SteamImageProps) {
  const details = useGameStore((s) => s.details[appId]);
  const setDetails = useGameStore((s) => s.setDetails);
  const storeCountryCode = useSettingsStore((s) => s.storeCountryCode);
  const [index, setIndex] = useState(0);

  const urls = useMemo(() => {
    const preferred =
      kind === "capsule"
        ? [details?.capsule_image, details?.header_image]
        : [details?.header_image, details?.capsule_image];
    return uniqueUrls([...preferred, ...guessedUrls(appId, kind)]);
  }, [appId, details?.capsule_image, details?.header_image, kind]);

  useEffect(() => {
    setIndex(0);
  }, [appId, kind, urls[0]]);

  const fetchDetailsIfNeeded = () => {
    if (details || detailsRequests.has(appId) || Date.now() - (detailsFailures.get(appId) ?? 0) < FAILURE_RETRY_MS) return;
    detailsRequests.add(appId);
    fetchGameDetails(appId, storeCountryCode)
      .then((result) => {
        setDetails(appId, result);
        scheduleOriginalReleaseDateFetch(appId, result.name);
      })
      .catch(() => {
        if (detailsFailures.size >= 1000) detailsFailures.delete(detailsFailures.keys().next().value!);
        detailsFailures.set(appId, Date.now());
      })
      .finally(() => detailsRequests.delete(appId));
  };

  const src = urls[index];
  useEffect(() => {
    if (!src) fetchDetailsIfNeeded();
  }, [src]);

  if (!src) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      draggable={draggable}
      className={className}
      onError={() => {
        fetchDetailsIfNeeded();
        setIndex((current) => current + 1);
      }}
    />
  );
}
