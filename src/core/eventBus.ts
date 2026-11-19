/**
 * Typed event bus. One bus is created per run and owned by GameScene; every listener is
 * removed when its scene shuts down (TDD: Architecture, event catalog).
 */
type Handler<P> = (payload: P) => void;

export class EventBus<Events extends object> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    const wrapped: Handler<Events[K]> = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    // Copy so handlers can unsubscribe (or subscribe) during dispatch.
    for (const h of [...set]) (h as Handler<Events[K]>)(payload);
  }

  listenerCount(event: keyof Events): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /** Remove every listener (called when the run ends). */
  clear(): void {
    this.handlers.clear();
  }
}
