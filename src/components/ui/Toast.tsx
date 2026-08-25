import { useToastStore } from "../../stores/toastStore";
import { CheckCircle, WarningCircle, Warning, Info, X } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";

const ICON_MAP = {
  success: <CheckCircle size={16} weight="fill" className="text-repressurizer-success shrink-0" />,
  error: <WarningCircle size={16} weight="fill" className="text-repressurizer-danger shrink-0" />,
  warning: <Warning size={16} weight="fill" className="text-repressurizer-warning shrink-0" />,
  info: <Info size={16} weight="fill" className="text-sky-400 shrink-0" />,
};

const BORDER_MAP = {
  success: "border-repressurizer-success/35 bg-repressurizer-success/[0.08]",
  error: "border-repressurizer-danger/35 bg-repressurizer-danger/[0.08]",
  warning: "border-repressurizer-warning/35 bg-repressurizer-warning/[0.08]",
  info: "border-sky-400/35 bg-sky-400/[0.08]",
};

export function ToastContainer() {
  const t = useT();
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-toast-in pointer-events-auto flex min-w-[280px] max-w-[420px] items-stretch overflow-hidden rounded-xl border ${BORDER_MAP[toast.type]} shadow-pop backdrop-blur-xl`}
        >
          <span aria-hidden="true" className={`w-1 shrink-0 ${toast.type === "success" ? "bg-repressurizer-success/70" : toast.type === "error" ? "bg-repressurizer-danger/70" : toast.type === "warning" ? "bg-repressurizer-warning/70" : "bg-sky-400/70"}`} />
          <span className="flex flex-1 items-start gap-2.5 px-3.5 py-3">
            {ICON_MAP[toast.type]}
            <p className="flex-1 text-sm leading-relaxed text-repressurizer-text">{toast.message}{toast.count > 1 && <span className="ml-2 inline-flex rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">×{toast.count}</span>}</p>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  remove(toast.id);
                }}
                className="focus-ring shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/10"
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(toast.id)}
              aria-label={t("common.close")}
              className="mt-0.5 shrink-0 rounded p-0.5 text-repressurizer-text-faint transition-colors hover:text-white"
            >
              <X size={12} weight="bold" />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
