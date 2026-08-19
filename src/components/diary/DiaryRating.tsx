import { useT } from "../../lib/i18n";

export function RatingControl({ rating, emojis, onChange, t, compact = false }: { rating: number; emojis: string[]; onChange: (rating: number) => void; t: ReturnType<typeof useT>; compact?: boolean }) {
  return <div className={compact ? "mt-3" : "mt-5"}>
    <input
      type="range"
      min="1"
      max="10"
      step="1"
      value={rating || 5}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label={t("diary.rating")}
      data-testid="diary-rating-input"
      className="diary-rating-slider h-2 w-full cursor-pointer rounded-full"
      style={{ background: `linear-gradient(to right, rgb(16 185 129) 0%, rgb(16 185 129) ${rating > 0 ? ((rating - 1) / 9) * 100 : 0}%, rgb(52 52 57) ${rating > 0 ? ((rating - 1) / 9) * 100 : 0}%, rgb(52 52 57) 100%)` }}
    />
    <div className="mt-2 grid grid-cols-10 text-repressurizer-text-faint">{Array.from({ length: 10 }, (_, index) => index + 1).map((score) => <button key={score} type="button" onClick={() => onChange(score)} aria-label={`${t("diary.rating")} ${score}: ${emojis[score - 1]}`} className={`focus-ring flex min-w-0 flex-col items-center rounded py-1 text-center transition-colors hover:bg-repressurizer-surface-hover hover:text-white ${rating === score ? "bg-repressurizer-accent/10 text-repressurizer-accent" : ""}`}><span className="text-sm leading-none">{emojis[score - 1]}</span><span className="mt-1 font-mono text-[8px] tabular-nums">{score}</span></button>)}</div>
    {rating > 0 && <button type="button" onClick={() => onChange(0)} className="focus-ring mt-1 text-[10px] text-repressurizer-text-faint transition-colors hover:text-repressurizer-text">{t("diary.rating.clear")}</button>}
  </div>;
}
