import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
  onlyWhenTruncated?: boolean;
  overflowSelector?: string;
}

interface TooltipPosition {
  anchorCenter: number;
  left: number;
  top: number;
  above: boolean;
}

export function Tooltip({
  content,
  children,
  className = "",
  onlyWhenTruncated = false,
  overflowSelector,
}: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const hide = () => setPosition(null);
  const show = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const overflowTarget = overflowSelector
      ? trigger.querySelector<HTMLElement>(overflowSelector)
      : trigger;
    if (onlyWhenTruncated && overflowTarget && overflowTarget.scrollWidth <= overflowTarget.clientWidth + 1) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const above = rect.bottom + 48 > window.innerHeight;
    const anchorCenter = rect.left + rect.width / 2;
    setPosition({
      // The final left edge is corrected after the portal has laid out and we
      // know the tooltip's actual width. This initial value keeps the first
      // paint close to the trigger instead of assuming every label is 328px.
      left: Math.max(8, rect.left),
      anchorCenter,
      top: above ? rect.top - 8 : rect.bottom + 8,
      above,
    });
  };

  useLayoutEffect(() => {
    if (!position || !tooltipRef.current) return;
    const width = tooltipRef.current.getBoundingClientRect().width;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const left = Math.min(Math.max(position.anchorCenter - width / 2, margin), maxLeft);
    if (Math.abs(position.left - left) < 0.5) return;
    setPosition((current) => (current ? { ...current, left } : current));
  }, [content, position]);

  useEffect(() => {
    if (!position) return;
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [position]);

  return (
    <>
      <span
        ref={triggerRef}
        className={className}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocusCapture={show}
        onPointerDownCapture={hide}
        onClickCapture={hide}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide();
        }}
      >
        {children}
      </span>
      {position && typeof document !== "undefined" && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          className="pointer-events-none fixed z-[120] max-w-xs rounded-lg border border-repressurizer-border bg-repressurizer-surface-raised px-2.5 py-1.5 text-xs leading-snug text-repressurizer-text shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          style={{
            left: position.left,
            top: position.top,
            transform: position.above ? "translateY(-100%)" : undefined,
          }}
        >
          {content}
        </span>,
        document.body
      )}
    </>
  );
}
