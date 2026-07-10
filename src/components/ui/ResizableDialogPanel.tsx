import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowCounterClockwise,
  ArrowsIn,
  ArrowsOut,
  DotsSix,
} from "@phosphor-icons/react";
import {
  clampDialogLayout,
  clearDialogLayout,
  readDialogLayout,
  writeDialogLayout,
  type DialogConstraints,
  type DialogLayout,
  type DialogViewport,
} from "../../lib/dialogLayout";
import { useT } from "../../lib/i18n";
import { Tooltip } from "./Tooltip";

export interface ResizableDialogRenderProps {
  sizeControls: ReactNode;
  isMaximized: boolean;
}

interface ResizableDialogPanelProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  dialogId: string;
  defaultSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  viewportMargin?: number;
  children: (props: ResizableDialogRenderProps) => ReactNode;
}

interface ResizeDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

function currentViewport(): DialogViewport {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function ResizableDialogPanel({
  dialogId,
  defaultSize,
  minSize = { width: 560, height: 420 },
  viewportMargin = 16,
  className = "",
  style,
  children,
  ...props
}: ResizableDialogPanelProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ResizeDrag | null>(null);
  const previousUserSelectRef = useRef("");
  const fallbackLayout: DialogLayout = {
    width: defaultSize.width,
    height: defaultSize.height,
    maximized: false,
  };
  const constraints: DialogConstraints = {
    minWidth: minSize.width,
    minHeight: minSize.height,
    viewportMargin,
  };
  const [viewport, setViewport] = useState<DialogViewport>(currentViewport);
  const [layout, setLayout] = useState<DialogLayout>(() => {
    if (typeof window === "undefined") return fallbackLayout;
    return readDialogLayout(window.localStorage, dialogId, fallbackLayout);
  });

  useEffect(() => {
    const updateViewport = () => setViewport(currentViewport());
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => () => {
    if (dragRef.current) document.body.style.userSelect = previousUserSelectRef.current;
  }, []);

  const visibleLayout = clampDialogLayout(
    layout.maximized
      ? { width: viewport.width, height: viewport.height, maximized: true }
      : layout,
    viewport,
    constraints
  );

  const commitLayout = useCallback((next: DialogLayout) => {
    setLayout(next);
    writeDialogLayout(window.localStorage, dialogId, next);
  }, [dialogId]);

  const resetSize = useCallback(() => {
    clearDialogLayout(window.localStorage, dialogId);
    setLayout(fallbackLayout);
  }, [defaultSize.height, defaultSize.width, dialogId]);

  const toggleMaximized = useCallback(() => {
    commitLayout({ ...layout, maximized: !layout.maximized });
  }, [commitLayout, layout]);

  const finishResize = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.userSelect = previousUserSelectRef.current;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    commitLayout(
      clampDialogLayout(
        { width: rect.width, height: rect.height, maximized: false },
        currentViewport(),
        constraints
      )
    );
  }, [commitLayout, minSize.height, minSize.width, viewportMargin]);

  const handleResizePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (layout.maximized || !panelRef.current) return;
    event.preventDefault();
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    previousUserSelectRef.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel || drag.pointerId !== event.pointerId) return;
    const next = clampDialogLayout(
      {
        width: drag.startWidth + event.clientX - drag.startX,
        height: drag.startHeight + event.clientY - drag.startY,
        maximized: false,
      },
      currentViewport(),
      constraints
    );
    panel.style.width = `${next.width}px`;
    panel.style.height = `${next.height}px`;
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (layout.maximized) return;
    const step = event.shiftKey ? 48 : 16;
    const delta = {
      width: event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0,
      height: event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0,
    };
    if (delta.width === 0 && delta.height === 0) return;
    event.preventDefault();
    commitLayout(
      clampDialogLayout(
        {
          width: visibleLayout.width + delta.width,
          height: visibleLayout.height + delta.height,
          maximized: false,
        },
        currentViewport(),
        constraints
      )
    );
  };

  const sizeControls = (
    <div className="flex shrink-0 items-center gap-0.5" data-dialog-size-controls>
      <Tooltip content={t("dialog.resetSize")}>
        <button
          type="button"
          onClick={resetSize}
          aria-label={t("dialog.resetSize")}
          className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-repressurizer-accent"
          data-dialog-reset-size
          data-dialog-size-control
        >
          <ArrowCounterClockwise size={14} weight="bold" />
        </button>
      </Tooltip>
      <Tooltip content={t(layout.maximized ? "dialog.restore" : "dialog.maximize")}>
        <button
          type="button"
          onClick={toggleMaximized}
          aria-label={t(layout.maximized ? "dialog.restore" : "dialog.maximize")}
          className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-repressurizer-accent"
          data-dialog-toggle-maximize
          data-dialog-size-control
        >
          {layout.maximized
            ? <ArrowsIn size={14} weight="bold" />
            : <ArrowsOut size={14} weight="bold" />}
        </button>
      </Tooltip>
    </div>
  );

  return (
    <div
      {...props}
      ref={panelRef}
      className={className}
      style={{
        ...style,
        width: visibleLayout.width,
        height: visibleLayout.height,
        maxWidth: Math.max(0, viewport.width - viewportMargin * 2),
        maxHeight: Math.max(0, viewport.height - viewportMargin * 2),
        containerType: "inline-size",
      }}
      data-resizable-dialog={dialogId}
      data-dialog-maximized={layout.maximized ? "true" : "false"}
    >
      {children({ sizeControls, isMaximized: layout.maximized })}
      {!layout.maximized && (
        <Tooltip
          content={t("dialog.resize")}
          className="absolute bottom-0.5 right-0.5 z-30"
        >
          <button
            type="button"
            aria-label={t("dialog.resize")}
            className="flex h-7 w-7 touch-none cursor-nwse-resize items-center justify-center rounded-br-xl rounded-tl-lg text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-repressurizer-accent"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            onLostPointerCapture={finishResize}
            onKeyDown={handleResizeKeyDown}
            data-dialog-resize-handle
            data-dialog-size-control
          >
            <DotsSix size={15} weight="bold" className="rotate-45" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
