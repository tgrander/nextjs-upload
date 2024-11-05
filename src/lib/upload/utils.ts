// eventListenerUtils.ts (Updated)

interface WorkerEventMap {
  install: ExtendableEvent;
  activate: ExtendableEvent;
  online: Event;
  message: ExtendableMessageEvent;
  // Add other event types as needed
}

export type EventHandler<K extends keyof WorkerEventMap> = (
  event: WorkerEventMap[K]
) => void;

/**
 * A generic utility to add event listeners with type safety.
 * @param target The event target (e.g., self in Service Worker).
 * @param type The event type.
 * @param handler The event handler.
 */
export function addTypedEventListener<K extends keyof WorkerEventMap>(
  target: EventTarget,
  type: K,
  handler: EventHandler<K>
): void {
  target.addEventListener(type, handler as EventListener);
}
