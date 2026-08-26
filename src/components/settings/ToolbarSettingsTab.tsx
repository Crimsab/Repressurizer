import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  DotsSixVertical,
  Eye,
  EyeSlash,
  PushPin,
} from "@phosphor-icons/react";
import {
  DEFAULT_HIDDEN_TOOLS,
  DEFAULT_PINNED_TOOLS,
  TOOLBAR_TOOLS,
  type ToolbarToolId,
} from "../../lib/toolbarTools";
import { useT } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";

export function ToolbarSettingsTab() {
  const t = useT();
  const settings = useSettingsStore();
  const [draggedId, setDraggedId] = useState<ToolbarToolId | null>(null);
  const [dragOverId, setDragOverId] = useState<ToolbarToolId | null>(null);
  const tools = settings.toolbarToolOrder.flatMap((id) => {
    const tool = TOOLBAR_TOOLS.find((candidate) => candidate.id === id);
    return tool ? [tool] : [];
  });
  const visiblePinnedIds = settings.toolbarToolOrder
    .filter(
      (id) =>
        settings.toolbarPinnedToolIds.includes(id) &&
        !settings.toolbarHiddenToolIds.includes(id),
    )
    .slice(0, settings.toolbarVisibleCount);
  const visiblePinnedSet = new Set(visiblePinnedIds);
  const setLocation = (
    id: ToolbarToolId,
    location: "header" | "more" | "hidden",
  ) => {
    const withoutId = (items: string[]) => items.filter((item) => item !== id);
    settings.setSettings({
      toolbarHiddenToolIds:
        location === "hidden"
          ? [...new Set([...withoutId(settings.toolbarHiddenToolIds), id])]
          : withoutId(settings.toolbarHiddenToolIds),
      toolbarPinnedToolIds:
        location === "header"
          ? [...new Set([...withoutId(settings.toolbarPinnedToolIds), id])]
          : withoutId(settings.toolbarPinnedToolIds),
    });
  };
  const setVisibleCount = (value: number) => {
    const nextCount = Math.max(0, Math.min(8, Math.round(value || 0)));
    const retainedPinnedIds = settings.toolbarToolOrder
      .filter(
        (id) =>
          settings.toolbarPinnedToolIds.includes(id) &&
          !settings.toolbarHiddenToolIds.includes(id),
      )
      .slice(0, nextCount);
    settings.setSettings({
      toolbarVisibleCount: nextCount,
      toolbarPinnedToolIds: retainedPinnedIds,
    });
  };
  const move = (id: ToolbarToolId, delta: number) => {
    const order = [...settings.toolbarToolOrder];
    const index = order.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    settings.setSettings({ toolbarToolOrder: order });
  };
  const moveTo = (source: ToolbarToolId, target: ToolbarToolId) => {
    if (source === target) return;
    const order = settings.toolbarToolOrder.filter((id) => id !== source);
    const targetIndex = order.indexOf(target);
    order.splice(targetIndex < 0 ? order.length : targetIndex, 0, source);
    settings.setSettings({ toolbarToolOrder: order });
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">
          {t("settings.toolbar.title")}
        </h3>
        <p className="mt-1 text-xs text-repressurizer-text-faint">
          {t("settings.toolbar.description")}
        </p>
      </div>
      <label className="flex max-w-xs items-center justify-between gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/45 px-3 py-2 text-xs text-repressurizer-text-muted">
        <span>{t("settings.toolbar.visibleCount")}</span>
        <input
          type="number"
          min={0}
          max={8}
          value={settings.toolbarVisibleCount}
          onChange={(event) => setVisibleCount(Number(event.target.value))}
          className="w-16 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2 py-1 text-right text-repressurizer-text"
        />
      </label>
      <div className="space-y-2">
        {tools.map((tool, index) => {
          const hidden = settings.toolbarHiddenToolIds.includes(tool.id);
          const pinned = visiblePinnedSet.has(tool.id);
          const headerFull = !pinned && visiblePinnedIds.length >= settings.toolbarVisibleCount;
          return (
            <div
              key={tool.id}
              data-testid={`toolbar-tool-${tool.id}`}
              draggable
              onDragStart={(event) => {
                setDraggedId(tool.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", tool.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverId(tool.id);
              }}
              onDragLeave={() =>
                setDragOverId((current) =>
                  current === tool.id ? null : current,
                )
              }
              onDrop={(event) => {
                event.preventDefault();
                const source = (draggedId ??
                  event.dataTransfer.getData("text/plain")) as ToolbarToolId;
                moveTo(source, tool.id);
                setDraggedId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
              className={`flex flex-wrap items-center gap-2 rounded-xl border bg-repressurizer-bg/45 p-3 transition-colors ${dragOverId === tool.id && draggedId !== tool.id ? "border-repressurizer-accent bg-repressurizer-accent/5" : "border-repressurizer-border-subtle"} ${draggedId === tool.id ? "opacity-45" : ""}`}
            >
              <span
                className="drag-handle -ml-1 inline-flex cursor-grab items-center text-repressurizer-text-faint"
                aria-hidden="true"
              >
                <DotsSixVertical size={16} />
              </span>
              <span className="min-w-36 flex-1 text-sm text-repressurizer-text">
                {t(tool.labelKey)}
              </span>
              <div
                className="flex items-center rounded-lg border border-repressurizer-border bg-repressurizer-surface p-0.5"
                role="group"
                aria-label={t(tool.labelKey)}
              >
                <button
                  type="button"
                  disabled={headerFull}
                  aria-pressed={pinned}
                  onClick={() => setLocation(tool.id, "header")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${pinned ? "bg-repressurizer-accent/15 text-repressurizer-accent" : "text-repressurizer-text-faint hover:text-repressurizer-text"}`}
                >
                  <PushPin size={12} />
                  {t("settings.toolbar.pinned")}
                </button>
                <button
                  type="button"
                  aria-pressed={!hidden && !pinned}
                  onClick={() => setLocation(tool.id, "more")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors ${!hidden && !pinned ? "bg-repressurizer-accent/15 text-repressurizer-accent" : "text-repressurizer-text-faint hover:text-repressurizer-text"}`}
                >
                  <Eye size={12} />
                  {t("settings.toolbar.inMore")}
                </button>
                <button
                  type="button"
                  aria-pressed={hidden}
                  onClick={() => setLocation(tool.id, "hidden")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors ${hidden ? "bg-repressurizer-danger/10 text-repressurizer-danger" : "text-repressurizer-text-faint hover:text-repressurizer-text"}`}
                >
                  <EyeSlash size={12} />
                  {t("settings.toolbar.hidden")}
                </button>
              </div>
              <button
                type="button"
                aria-label={t("settings.toolbar.moveUp")}
                disabled={index === 0}
                onClick={() => move(tool.id, -1)}
                className="rounded-lg border border-repressurizer-border p-1.5 text-repressurizer-text-muted disabled:opacity-30"
              >
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                aria-label={t("settings.toolbar.moveDown")}
                disabled={index === tools.length - 1}
                onClick={() => move(tool.id, 1)}
                className="rounded-lg border border-repressurizer-border p-1.5 text-repressurizer-text-muted disabled:opacity-30"
              >
                <ArrowDown size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() =>
          settings.setSettings({
            toolbarToolOrder: TOOLBAR_TOOLS.map((tool) => tool.id),
            toolbarPinnedToolIds: DEFAULT_PINNED_TOOLS,
            toolbarHiddenToolIds: DEFAULT_HIDDEN_TOOLS,
            toolbarVisibleCount: 6,
          })
        }
        className="rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted hover:text-white"
      >
        {t("settings.toolbar.reset")}
      </button>
    </section>
  );
}
