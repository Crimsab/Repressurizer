import { create } from "zustand";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, default 4000
  actionLabel?: string;
  onAction?: () => void;
  count: number;
}

interface ToastState {
  toasts: Toast[];
  add: (type: ToastType, message: string, duration?: number) => void;
  addAction: (type: ToastType, message: string, actionLabel: string, onAction: () => void, duration?: number) => void;
  remove: (id: string) => void;
  dismissAll: () => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

let counter = 0;
const MAX_VISIBLE_TOASTS = 4;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set) => {
  const remove = (id: string) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  };
  const enqueue = (type: ToastType, message: string, duration: number, actionLabel?: string, onAction?: () => void) => {
    let id = "";
    set((state) => {
      const duplicate = state.toasts.find((toast) => toast.type === type && toast.message === message && toast.actionLabel === actionLabel);
      if (duplicate) {
        id = duplicate.id;
        return { toasts: [...state.toasts.filter((toast) => toast.id !== duplicate.id), { ...duplicate, count: duplicate.count + 1, duration, onAction: onAction ?? duplicate.onAction }] };
      }
      id = `toast-${++counter}`;
      return { toasts: [...state.toasts, { id, type, message, duration, actionLabel, onAction, count: 1 }].slice(-MAX_VISIBLE_TOASTS) };
    });
    const previousTimer = timers.get(id);
    if (previousTimer) clearTimeout(previousTimer);
    if (duration > 0) timers.set(id, setTimeout(() => remove(id), duration));
  };

  return {
    toasts: [],
    add: (type, message, duration = 4000) => enqueue(type, message, duration),
    addAction: (type, message, actionLabel, onAction, duration = 8000) => enqueue(type, message, duration, actionLabel, onAction),
    remove,
    dismissAll: () => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); set({ toasts: [] }); },
    success: (message) => enqueue("success", message, 4000),
    error: (message) => enqueue("error", message, 6000),
    warning: (message) => enqueue("warning", message, 5000),
    info: (message) => enqueue("info", message, 4000),
  };
});
