import type { MouseEvent, ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import type { CategoryChipStyleSettings } from "../../lib/types";
import { categoryChipSurfaceStyle } from "../../lib/categoryChipStyles";

interface CategoryChipProps {
  name: string;
  color: string | null;
  settings: CategoryChipStyleSettings;
  title?: string;
  className?: string;
  leading?: ReactNode;
  removeLabel?: string;
  forceShowRemove?: boolean;
  onClick?: () => void;
  onRemove?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function CategoryChip({
  name,
  color,
  settings,
  title,
  className = "",
  leading,
  removeLabel,
  forceShowRemove = false,
  onClick,
  onRemove,
}: CategoryChipProps) {
  const removable = Boolean(onRemove && settings.showRemoveButton);
  const isDotLabel = settings.preset === "dotLabel";
  const style = categoryChipSurfaceStyle(color, settings);
  const content = (
    <>
      {isDotLabel ? (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color ?? "currentColor" }}
        />
      ) : leading}
      <span className="min-w-0 truncate">{name}</span>
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className={`ml-0.5 shrink-0 text-repressurizer-danger ${forceShowRemove ? "inline-flex" : "hidden group-hover/chip:inline-flex"}`}
          aria-label={removeLabel ?? name}
        >
          <X size={Math.max(8, settings.fontSize - 1)} weight="bold" />
        </button>
      )}
    </>
  );

  const classes = [
    onClick ? "btn-press" : "",
    "group/chip inline-flex shrink-0 items-center gap-1 border border-transparent px-1.5 font-medium transition-colors",
    isDotLabel ? "bg-transparent px-0.5 text-repressurizer-text-muted" : "text-repressurizer-text",
    onClick ? "hover:border-repressurizer-accent/50 hover:bg-repressurizer-surface-hover" : "",
    className,
  ].filter(Boolean).join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        title={title ?? name}
        onClick={onClick}
        className={classes}
        style={style}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      title={title ?? name}
      className={classes}
      style={style}
    >
      {content}
    </span>
  );
}
