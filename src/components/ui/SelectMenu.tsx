import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check } from "@phosphor-icons/react";

export interface SelectMenuOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface SelectMenuProps<T extends string> {
  value: T;
  options: SelectMenuOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
  size?: "sm" | "md";
  className?: string;
  labelClassName?: string;
  buttonClassName?: string;
  menuClassName?: string;
}

interface MenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  placeholder = "Select",
  disabled = false,
  align = "left",
  size = "md",
  className,
  labelClassName,
  buttonClassName,
  menuClassName,
}: SelectMenuProps<T>) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const selectedLabel = selected?.label ?? placeholder;
  const accessibleLabel = ariaLabel
    ? `${ariaLabel}: ${selectedLabel}`
    : label
      ? `${label}: ${selectedLabel}`
      : undefined;

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const gutter = 8;
    const gap = 6;
    const preferredMaxHeight = 240;
    const estimatedHeight = Math.min(preferredMaxHeight, Math.max(44, options.length * 34 + 8));
    const triggerWidth = rect.width;
    const menuWidth = Math.max(triggerWidth, 156);
    const spaceBelow = window.innerHeight - rect.bottom - gutter - gap;
    const spaceAbove = rect.top - gutter - gap;
    const shouldOpenUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(96, Math.min(preferredMaxHeight, shouldOpenUp ? spaceAbove : spaceBelow));

    let left = align === "right" ? rect.right - menuWidth : rect.left;
    left = Math.max(gutter, Math.min(left, window.innerWidth - menuWidth - gutter));

    setPosition(
      shouldOpenUp
        ? {
            left,
            width: menuWidth,
            maxHeight,
            bottom: window.innerHeight - rect.top + gap,
          }
        : {
            left,
            width: menuWidth,
            maxHeight,
            top: rect.bottom + gap,
          }
    );
  }, [align, options.length]);

  const focusSelectedOption = useCallback(() => {
    requestAnimationFrame(() => {
      const optionButtons = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []
      );
      const selectedOption = optionButtons.find((option) => option.getAttribute("aria-selected") === "true");
      (selectedOption ?? optionButtons[0])?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    focusSelectedOption();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [focusSelectedOption, open, updatePosition]);

  const buttonSizeClass =
    size === "sm"
      ? "h-8 px-2.5 text-xs"
      : "h-9 px-3 text-sm";

  const menu = open && position && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          onKeyDown={(event) => {
            const optionButtons = Array.from(
              menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []
            );
            if (!optionButtons.length) return;

            const currentIndex = Math.max(0, optionButtons.indexOf(document.activeElement as HTMLButtonElement));
            const focusOption = (index: number) => {
              event.preventDefault();
              optionButtons[index]?.focus({ preventScroll: true });
            };

            if (event.key === "ArrowDown") focusOption((currentIndex + 1) % optionButtons.length);
            if (event.key === "ArrowUp") focusOption((currentIndex - 1 + optionButtons.length) % optionButtons.length);
            if (event.key === "Home") focusOption(0);
            if (event.key === "End") focusOption(optionButtons.length - 1);
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          style={{
            position: "fixed",
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
            top: position.top,
            bottom: position.bottom,
          }}
          className={cn(
            "z-[90] overflow-auto rounded-lg border border-repressurizer-border bg-repressurizer-bg py-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]",
            menuClassName
          )}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value || "__empty"}
                type="button"
                role="option"
                aria-selected={active}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                  active
                    ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                    : "text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 block truncate text-[10px] text-repressurizer-text-faint">
                      {option.description}
                    </span>
                  )}
                </span>
                {active && <Check size={12} className="mt-0.5 shrink-0" weight="bold" />}
              </button>
            );
          })}
        </div>,
        buttonRef.current?.closest('[role="dialog"]') ?? document.body
      )
    : null;

  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <span
          className={cn(
            "mb-1 block text-[10px] font-medium uppercase tracking-wider text-repressurizer-text-faint",
            labelClassName
          )}
        >
          {label}
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-label={accessibleLabel}
        aria-haspopup="listbox"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "btn-press flex w-full items-center gap-2 rounded-lg border text-left font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
          buttonSizeClass,
          open
            ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
            : "border-repressurizer-border bg-repressurizer-bg text-repressurizer-text hover:bg-repressurizer-surface-hover hover:text-white",
          buttonClassName
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <CaretDown
          size={12}
          className={cn("shrink-0 text-repressurizer-text-faint transition-transform", open && "rotate-180")}
          weight="bold"
        />
      </button>
      {menu}
    </div>
  );
}
