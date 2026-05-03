import { create } from "zustand";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, default 4000
}

interface ToastState {
  toasts: Toast[];
  add: (type: ToastType, message: string, duration?: number) => void;
  remove: (id: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  add: (type, message, duration = 4000) => {
    const id = `toast-${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, message, duration }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },

  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  success: (message) => {
    const id = `toast-${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, type: "success", message, duration: 4000 }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },

  error: (message) => {
    const id = `toast-${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, type: "error", message, duration: 6000 }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000);
  },

  warning: (message) => {
    const id = `toast-${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, type: "warning", message, duration: 5000 }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },

  info: (message) => {
    const id = `toast-${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, type: "info", message, duration: 4000 }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
}));
