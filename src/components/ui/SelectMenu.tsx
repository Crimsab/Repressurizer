import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check, MagnifyingGlass } from "@phosphor-icons/react";

export interface SelectMenuOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
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
  testId?: string;
  searchLabel?: string;
  emptyLabel?: string;
}

interface MenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

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
  testId,
  searchLabel,
  emptyLabel,
}: SelectMenuProps<T>) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const filteredOptions = useMemo(() => {
    const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
    const needle = normalize(query.trim());
    return !searchLabel || !needle ? options : options.filter((option) => normalize(`${option.label} ${option.value} ${option.description ?? ""}`).includes(needle));
  }, [options, query, searchLabel]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
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
    const preferredMaxHeight = searchLabel ? 336 : 240;
    const estimatedHeight = Math.min(
      preferredMaxHeight,
      Math.max(44, options.length * 34 + 8 + (searchLabel ? 48 : 0)),
    );
    const triggerWidth = rect.width;
    const menuWidth = Math.max(triggerWidth, 156);
    const spaceBelow = window.innerHeight - rect.bottom - gutter - gap;
    const spaceAbove = rect.top - gutter - gap;
    const shouldOpenUp =
      spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      96,
      Math.min(preferredMaxHeight, shouldOpenUp ? spaceAbove : spaceBelow),
    );

    let left = align === "right" ? rect.right - menuWidth : rect.left;
    left = Math.max(
      gutter,
      Math.min(left, window.innerWidth - menuWidth - gutter),
    );

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
          },
    );
  }, [align, options.length, searchLabel]);

  const focusSelectedOption = useCallback(() => {
    requestAnimationFrame(() => {
      if (searchLabel) { searchRef.current?.focus({ preventScroll: true }); return; }
      const optionButtons = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="option"]:not(:disabled)',
        ) ?? [],
      );
      const selectedOption = optionButtons.find(
        (option) => option.getAttribute("aria-selected") === "true",
      );
      (selectedOption ?? optionButtons[0])?.focus({ preventScroll: true });
    });
  }, [searchLabel]);

  useEffect(() => {
    if (!open) { setQuery(""); return; }

    updatePosition();
    focusSelectedOption();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
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
    size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";

  const menu =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            data-select-menu-popover="true"
            onKeyDown={(event) => {
              const optionButtons = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>(
                  '[role="option"]:not(:disabled)',
                ) ?? [],
              );
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                buttonRef.current?.focus();
                return;
              }
              if (event.key === "Tab" && searchLabel) {
                setOpen(false);
                buttonRef.current?.focus();
                return;
              }
              if (!optionButtons.length) return;
              if (event.target === searchRef.current) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  optionButtons[event.key === "ArrowDown" ? 0 : optionButtons.length - 1]?.focus();
                }
                return;
              }

              const currentIndex = Math.max(
                0,
                optionButtons.indexOf(
                  document.activeElement as HTMLButtonElement,
                ),
              );
              const focusOption = (index: number) => {
                event.preventDefault();
                optionButtons[index]?.focus({ preventScroll: true });
                optionButtons[index]?.scrollIntoView({ block: "nearest" });
              };

              if (event.key === "ArrowDown")
                focusOption((currentIndex + 1) % optionButtons.length);
              if (event.key === "ArrowUp")
                focusOption(
                  (currentIndex - 1 + optionButtons.length) %
                    optionButtons.length,
                );
              if (event.key === "Home") focusOption(0);
              if (event.key === "End") focusOption(optionButtons.length - 1);
            }}
            style={{
              position: "fixed",
              zIndex: 100,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              top: position.top,
              bottom: position.bottom,
            }}
            className={cn(
              "animate-fade-in-stable flex flex-col overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface-raised shadow-pop",
              menuClassName,
            )}
          >
            {searchLabel && (
              <div className="shrink-0 border-b border-repressurizer-border-subtle px-2 py-2">
                <div className="flex items-center gap-2 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 focus-within:border-repressurizer-accent/60">
                  <MagnifyingGlass size={14} aria-hidden="true" className="shrink-0 text-repressurizer-text-faint" />
                  <input
                    ref={searchRef}
                    autoFocus
                    type="search"
                    aria-label={searchLabel}
                    aria-controls={`${menuId}-options`}
                    placeholder={searchLabel}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoComplete="off"
                    className="h-9 min-w-0 flex-1 bg-transparent text-xs text-repressurizer-text outline-none"
                  />
                </div>
              </div>
            )}
            <div id={`${menuId}-options`} role="listbox" aria-label={ariaLabel ?? label} className="min-h-0 overflow-y-auto overscroll-contain py-1">
            {filteredOptions.map((option) => {
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
                    "relative flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    active
                      ? "bg-repressurizer-accent/[0.12] font-medium text-repressurizer-accent"
                      : "text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-repressurizer-accent"
                    />
                  )}
                  {option.icon && <span aria-hidden="true" className="mt-0.5 flex shrink-0 items-center">{option.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate leading-none">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="mt-0.5 block truncate text-[10px] text-repressurizer-text-faint">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {active && (
                    <Check
                      size={12}
                      className="mt-0.5 shrink-0"
                      weight="bold"
                    />
                  )}
                </button>
              );
            })}
            </div>
            {filteredOptions.length === 0 && emptyLabel && <p role="status" className="px-3 py-4 text-xs text-repressurizer-text-faint">{emptyLabel}</p>}
          </div>,
          buttonRef.current?.closest('[role="dialog"]') ?? document.body,
        )
      : null;

  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <span
          className={cn(
            "mb-1 block text-[10px] font-medium uppercase tracking-wider text-repressurizer-text-faint",
            labelClassName,
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
        aria-controls={open ? `${menuId}-options` : undefined}
        aria-expanded={open}
        disabled={disabled}
        data-testid={testId}
        onClick={() => setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "btn-press flex w-full items-center gap-2 rounded-lg border text-left font-medium transition-[background-color,border-color,box-shadow,color] disabled:cursor-not-allowed disabled:opacity-45",
          buttonSizeClass,
          open
            ? "border-repressurizer-accent/70 bg-repressurizer-accent/10 text-repressurizer-accent shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
            : "border-repressurizer-border bg-repressurizer-surface/60 text-repressurizer-text hover:border-repressurizer-border hover:bg-repressurizer-surface-hover hover:text-white",
          buttonClassName,
        )}
      >
        {selected?.icon && <span aria-hidden="true" className="flex shrink-0 items-center">{selected.icon}</span>}
        <span className="min-w-0 flex-1 truncate leading-none">
          {selectedLabel}
        </span>
        <CaretDown
          size={12}
          className={cn(
            "shrink-0 text-repressurizer-text-faint transition-transform",
            open && "rotate-180",
          )}
          weight="bold"
        />
      </button>
      {menu}
    </div>
  );
}
