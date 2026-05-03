import { useToastStore } from "../../stores/toastStore";
import { CheckCircle, WarningCircle, Warning, Info, X } from "@phosphor-icons/react";

const ICON_MAP = {
  success: <CheckCircle size={16} weight="fill" className="text-repressurizer-success shrink-0" />,
  error: <WarningCircle size={16} weight="fill" className="text-repressurizer-danger shrink-0" />,
  warning: <Warning size={16} weight="fill" className="text-repressurizer-warning shrink-0" />,
  info: <Info size={16} weight="fill" className="text-sky-400 shrink-0" />,
};

const BORDER_MAP = {
  success: "border-repressurizer-success/20",
  error: "border-repressurizer-danger/20",
  warning: "border-repressurizer-warning/20",
  info: "border-sky-400/20",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border ${BORDER_MAP[toast.type]} bg-repressurizer-surface px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-toast-in min-w-[280px] max-w-[420px]`}
        >
          {ICON_MAP[toast.type]}
          <p className="flex-1 text-sm text-repressurizer-text leading-relaxed">{toast.message}</p>
          <button
            onClick={() => remove(toast.id)}
            className="shrink-0 text-repressurizer-text-faint hover:text-white transition-colors mt-0.5"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      ))}
    </div>
  );
}
