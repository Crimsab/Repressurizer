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
  const updateList = (
    key: "toolbarPinnedToolIds" | "toolbarHiddenToolIds",
    id: ToolbarToolId,
    enabled: boolean,
  ) => {
    const current = settings[key] as string[];
    settings.setSettings({
      [key]: enabled
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id),
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
          onChange={(event) =>
            settings.setSettings({
              toolbarVisibleCount: Number(event.target.value),
            })
          }
          className="w-16 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2 py-1 text-right text-repressurizer-text"
        />
      </label>
      <div className="space-y-2">
        {tools.map((tool, index) => {
          const hidden = settings.toolbarHiddenToolIds.includes(tool.id);
          const pinned = settings.toolbarPinnedToolIds.includes(tool.id);
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
              <button
                type="button"
                onClick={() =>
                  updateList("toolbarHiddenToolIds", tool.id, !hidden)
                }
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] ${hidden ? "border-repressurizer-border text-repressurizer-text-faint" : "border-repressurizer-accent/40 text-repressurizer-accent"}`}
              >
                {hidden ? <EyeSlash size={12} /> : <Eye size={12} />}
                {t(
                  hidden ? "settings.toolbar.hidden" : "settings.toolbar.shown",
                )}
              </button>
              <button
                type="button"
                disabled={hidden}
                onClick={() =>
                  updateList("toolbarPinnedToolIds", tool.id, !pinned)
                }
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] disabled:opacity-35 ${pinned ? "border-repressurizer-accent/40 text-repressurizer-accent" : "border-repressurizer-border text-repressurizer-text-muted"}`}
              >
                <PushPin size={12} />
                {t(
                  pinned
                    ? "settings.toolbar.pinned"
                    : "settings.toolbar.inMore",
                )}
              </button>
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
            toolbarVisibleCount: 3,
          })
        }
        className="rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted hover:text-white"
      >
        {t("settings.toolbar.reset")}
      </button>
    </section>
  );
}
