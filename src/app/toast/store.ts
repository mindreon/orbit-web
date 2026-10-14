import { create } from "zustand";

export type ToastTone = "success" | "info" | "danger";

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
}

interface ToastStore {
  readonly toasts: readonly Toast[];
  readonly push: (tone: ToastTone, message: string) => number;
  readonly dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (tone, message) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Callable from anywhere, React or not. */
export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  info: (message: string) => useToastStore.getState().push("info", message),
  error: (message: string) => useToastStore.getState().push("danger", message),
};
