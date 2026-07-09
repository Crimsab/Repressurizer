import { useState, type ReactNode } from "react";
import { Star } from "@phosphor-icons/react";
import { useReviewStore } from "../../stores/reviewStore";
import type { GameDetails } from "../../lib/types";
import { useT } from "../../lib/i18n";

export function RatingWidget({ appId }: { appId: number }) {
  const t = useT();
  const rating = useReviewStore((s) => s.reviews[appId]?.rating ?? 0);
  const setRating = useReviewStore((s) => s.setRating);
  const clearRating = useReviewStore((s) => s.clearRating);
  const [hovered, setHovered] = useState(0);

  const display = hovered || rating;

  return (
    <div className="border-t border-repressurizer-border pt-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium flex items-center gap-1.5">
          <Star size={12} weight="duotone" />
          {t("review.title")}
        </h3>
        {rating > 0 && (
          <button
            onClick={() => clearRating(appId)}
            className="text-[11px] text-repressurizer-text-faint hover:text-repressurizer-text-muted transition-colors"
          >
            {t("review.clear")}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onMouseEnter={() => setHovered(n)}
            onClick={() => setRating(appId, n)}
            className="btn-press p-0.5 transition-colors"
          >
            <Star
              size={20}
              weight={n <= display ? "fill" : "regular"}
              className={
                n <= display
                  ? "text-amber-400"
                  : "text-repressurizer-text-faint hover:text-repressurizer-text-muted"
              }
            />
          </button>
        ))}
        {display > 0 && (
          <span className="ml-2 font-mono text-sm font-bold text-amber-400 tabular-nums">
            {display}/10
          </span>
        )}
      </div>
    </div>
  );
}

export function PriceBlock({ details }: { details: GameDetails }) {
  const t = useT();
  if (details.is_free) {
    return <p className="text-sm font-mono tabular-nums text-repressurizer-text">{t("detail.freeToPlay")}</p>;
  }

  const currency = details.price_currency ?? "";
  const initial = details.price_initial;
  const final = details.price_final ?? details.price_initial;
  if (final == null) {
    return <p className="text-sm text-repressurizer-text-faint">{t("common.unknown")}</p>;
  }

  const format = (value: number) => `${(value / 100).toFixed(2)} ${currency}`.trim();
  const discounted = initial != null && initial > final;
  const discountPercent = discounted ? Math.round(((initial - final) / initial) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {discounted && (
          <span className="rounded-md bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
            -{discountPercent}%
          </span>
        )}
        <p className="text-sm font-mono font-semibold tabular-nums text-repressurizer-text">
          {format(final)}
        </p>
      </div>
      {discounted && (
        <p className="font-mono text-[11px] tabular-nums text-repressurizer-text-faint line-through">
          {format(initial)}
        </p>
      )}
    </div>
  );
}


export function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle p-3.5">
      <div className="flex items-center gap-1.5 text-repressurizer-text-faint mb-1">
        {icon}
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}
