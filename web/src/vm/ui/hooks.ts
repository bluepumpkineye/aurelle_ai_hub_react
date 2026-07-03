/** React ↔ VMStore bridge hooks. */

import { useEffect, useReducer, useState } from "react";
import type { VMEvents, VMStore } from "../store/VMStore";

/** Re-render when any of the given store events fire. */
export function useStoreEvents(store: VMStore | null, events: Array<keyof VMEvents>): number {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!store) return;
    const offs = events.map((e) => store.events.on(e, () => bump()));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, events.join("|")]);
  return tick;
}

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "warn" | "error";
}

export function useToasts(store: VMStore | null): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    if (!store) return;
    let n = 0;
    const off = store.events.on("toast", ({ message, tone }) => {
      const id = ++n + Date.now();
      setToasts((t) => [...t.slice(-3), { id, message, tone }]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
    });
    return off;
  }, [store]);
  return toasts;
}
