export function virtualWindow(count: number, columns: number, stride: number,
  scrollTop: number, viewportHeight: number, overscan = 3) {
  const size = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const cols = Math.max(1, Math.floor(Number.isFinite(columns) ? columns : 1));
  const step = Math.max(1, Number.isFinite(stride) ? stride : 1);
  const rows = Math.ceil(size / cols);
  const height = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);
  const scroll = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
  const extra = Math.max(0, Math.floor(overscan));
  const first = Math.min(Math.max(0, rows - 1), Math.max(0, Math.floor(scroll / step) - extra));
  const last = Math.min(rows, Math.max(first + 1, Math.ceil((scroll + height) / step) + extra));
  return { start: first * cols, end: Math.min(size, last * cols),
    paddingTop: first * step, paddingBottom: Math.max(0, (rows - last) * step) };
}
