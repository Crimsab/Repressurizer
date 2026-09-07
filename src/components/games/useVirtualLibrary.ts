import { useLayoutEffect, useRef, useState } from "react";
import { virtualWindow } from "../../lib/virtualWindow";

export function useVirtualLibrary(count: number, mode: "grid" | "list", resetKey: unknown) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ width: 0, height: 800, scrollTop: 0, rowHeight: 0 });
  const previousReset = useRef(resetKey);
  const virtual = count > 100;
  useLayoutEffect(() => {
    const container = containerRef.current;
    const scroller = container?.closest<HTMLElement>("[data-library-scroll]");
    if (!container || !scroller) return;
    if (previousReset.current !== resetKey) {
      scroller.scrollTop = 0;
      previousReset.current = resetKey;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const offset = container.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const first = container.firstElementChild;
      const next = { width: container.clientWidth, height: scroller.clientHeight,
        scrollTop: Math.max(0, scroller.scrollTop - offset),
        rowHeight: first instanceof HTMLElement ? first.getBoundingClientRect().height : 0 };
      setMetrics((old) => Object.keys(next).every((key) =>
        Math.abs(old[key as keyof typeof old] - next[key as keyof typeof next]) < 0.5) ? old : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    observer.observe(scroller);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    scroller.addEventListener("scroll", schedule, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mode, virtual, resetKey, count]);
  const columns = mode === "list" ? 1 : Math.max(1, Math.floor((metrics.width + 12) / 252));
  const gap = mode === "list" ? 2 : 12;
  const estimatedHeight = mode === "list" ? 36 : ((metrics.width - (columns - 1) * 12) / columns) * 21.5 / 46 + 100;
  const stride = (metrics.rowHeight || Math.max(36, estimatedHeight)) + gap;
  const window = virtualWindow(count, columns, stride, metrics.scrollTop, metrics.height);
  return { containerRef, start: virtual ? window.start : 0, end: virtual ? window.end : count,
    style: virtual ? { paddingTop: window.paddingTop, paddingBottom: window.paddingBottom } : undefined };
}
