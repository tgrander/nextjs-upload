// serviceWorker.ts

/// <reference lib="webworker" />

import { WorkerOutboundMessage, isWorkerInboundMessage } from "./types";

import { UploadHandler } from "./uploadHandler";
import { addTypedEventListener } from "./utils";
import { broadcastLog } from "./logger";

declare const self: ServiceWorkerGlobalScope;

// Initialize the UploadHandler
const uploadHandler = new UploadHandler();

/**
 * Handles incoming messages with type safety.
 * @param event The message event from the main thread.
 */
const handleMessage = async (event: ExtendableMessageEvent) => {
  const data = event.data;

  // Type guard to ensure data is a WorkerInboundMessage
  if (!isWorkerInboundMessage(data)) {
    broadcastLog("Invalid message received", "error");
    return;
  }

  const message = data;

  const contentId = "contentId" in message ? message.contentId : undefined;
  broadcastLog(`Received message: ${message.type}`, "info", contentId);

  try {
    switch (message.type) {
      case "START_UPLOAD":
        await uploadHandler.handleUpload(message);
        break;
      case "PAUSE_UPLOAD":
        await uploadHandler.handlePause(message.contentId);
        break;
      case "RESUME_UPLOAD":
        await uploadHandler.handleResume(message.contentId);
        break;
      case "CANCEL_UPLOAD":
        await uploadHandler.handleCancel(message.contentId);
        break;
      case "GET_UPLOAD_STATUS":
        await uploadHandler.handleGetUploadStatus(message.contentId);
        break;
      case "GET_ACTIVE_UPLOADS":
        await uploadHandler.handleGetActiveUploads();
        break;
      case "HEARTBEAT":
        break;
      default:
        const exhaustiveCheck: never = message;
        broadcastLog(
          `Unhandled message type: ${JSON.stringify(exhaustiveCheck)}`,
          "warn",
          contentId
        );
    }
  } catch (error) {
    const workerError = error as WorkerOutboundMessage & { contentId?: string };

    broadcastLog(
      `Error handling message ${message.type}: ${
        "message" in workerError ? workerError.message : "Unexpected error"
      }`,
      "error",
      workerError.contentId
    );
  }
};

// Install event
addTypedEventListener(self, "install", (event) => {
  console.log("Service Worker installing.");
  event.waitUntil(self.skipWaiting()); // Activate worker immediately
});

// Activate event
addTypedEventListener(self, "activate", (event) => {
  console.log("Service Worker activating.");
  event.waitUntil(uploadHandler.loadOngoingUploads());
});

// Online event
addTypedEventListener(self, "online", () => {
  void uploadHandler.resumeAllUploads();
});

// Message event with improved type safety
addTypedEventListener(self, "message", handleMessage);
