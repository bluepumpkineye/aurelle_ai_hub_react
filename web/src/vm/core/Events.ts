/** Minimal typed event emitter — the reactive spine between stores, 3D scene and React UI. */

export type Listener<T> = (payload: T) => void;

export class Emitter<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  on<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<never>);
    return () => set?.delete(fn as Listener<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) (fn as Listener<EventMap[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
