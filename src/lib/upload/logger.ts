import { LogMessage, WorkerOutboundMessage } from "./types";

declare const self: ServiceWorkerGlobalScope;

export function broadcastLog(
  message: string,
  level: "info" | "warn" | "error" = "info",
  contentId?: string
) {
  const logMessage: LogMessage = {
    type: "LOG",
    contentId,
    message,
    level,
  };
  broadcast(logMessage);
}

export function broadcast(message: WorkerOutboundMessage): void {
  void self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage(message));
  });
}
