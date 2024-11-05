import {
  ChunkConfig,
  ResumeData,
  RetryConfig,
  UploadState,
  UploadStatus,
  WorkerErrorDetails,
} from "./uploadManagement";

// ====================
// Inbound Messages
// ====================

export type WorkerInboundMessage =
  | StartUploadMessage
  | ResumeUploadMessage
  | PauseUploadMessage
  | CancelUploadMessage
  | GetUploadStatusMessage
  | GetActiveUploadsMessage
  | HeartbeatMessage;

export interface StartUploadMessage {
  type: "START_UPLOAD";
  file: File;
  duration: number;
  fileType: string;
  retryConfig?: RetryConfig;
  chunkConfig?: ChunkConfig;
}

export interface ResumeUploadMessage {
  type: "RESUME_UPLOAD";
  contentId: string;
}

export interface PauseUploadMessage {
  type: "PAUSE_UPLOAD";
  contentId: string;
}

export interface CancelUploadMessage {
  type: "CANCEL_UPLOAD";
  contentId: string;
}

export interface GetUploadStatusMessage {
  type: "GET_UPLOAD_STATUS";
  contentId: string;
}

export interface GetActiveUploadsMessage {
  type: "GET_ACTIVE_UPLOADS";
}

export interface HeartbeatMessage {
  type: "HEARTBEAT";
}

// ====================
// Outbound Messages
// ====================

export type WorkerOutboundMessage =
  | UploadProgressMessage
  | UploadCompleteMessage
  | UploadErrorMessage
  | UploadPausedMessage
  | UploadCancelledMessage
  | UploadStatusMessage
  | ChunkUploadedMessage
  | RetryingChunkMessage
  | InitiateUploadResponseMessage
  | LogMessage
  | UploadsUpdateMessage;

export interface UploadProgressMessage {
  type: "UPLOAD_PROGRESS";
  contentId: string;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  uploadSpeed?: number; // bytes per second
  timeRemaining?: number; // seconds
  activeConnections?: number;
}

export interface UploadCompleteMessage {
  type: "UPLOAD_COMPLETE";
  contentId: string;
  fileUrl: string;
  duration: number; // total upload time in ms
  totalBytes: number;
  averageSpeed: number; // bytes per second
}

export interface UploadErrorMessage {
  type: "UPLOAD_ERROR";
  contentId: string;
  error: WorkerErrorDetails;
}

export interface UploadPausedMessage {
  type: "UPLOAD_PAUSED";
  contentId: string;
  resumeData: ResumeData;
}

export interface UploadCancelledMessage {
  type: "UPLOAD_CANCELLED";
  contentId: string;
  reason?: string;
}

export interface UploadStatusMessage {
  type: "UPLOAD_STATUS";
  contentId: string;
  status: UploadStatus | { status: "not_found" };
}

export interface ChunkUploadedMessage {
  type: "CHUNK_UPLOADED";
  contentId: string;
  partNumber: number;
  size: number;
}

export interface RetryingChunkMessage {
  type: "RETRYING_CHUNK";
  contentId: string;
  partNumber: number;
  attempt: number;
  maxAttempts: number;
  error: string;
  nextAttemptDelay: number;
}

export interface InitiateUploadResponseMessage {
  type: "INITIATE_UPLOAD_RESPONSE";
  contentId: string;
  uploadId: string;
  key: string;
}

export interface LogMessage {
  type: "LOG";
  contentId?: string;
  message: string;
  level?: "info" | "warn" | "error";
}

export interface UploadsUpdateMessage {
  type: "UPLOADS_UPDATE";
  uploads: UploadState[];
}

// ====================
// Type Guards
// ====================

export function isWorkerInboundMessage(
  message: unknown
): message is WorkerInboundMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    typeof (message as any).type === "string" &&
    [
      "START_UPLOAD",
      "PAUSE_UPLOAD",
      "RESUME_UPLOAD",
      "CANCEL_UPLOAD",
      "GET_UPLOAD_STATUS",
      "GET_ACTIVE_UPLOADS",
      "HEARTBEAT",
    ].includes((message as any).type)
  );
}

export function isWorkerOutboundMessage(
  message: unknown
): message is WorkerOutboundMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    typeof (message as any).type === "string" &&
    [
      "UPLOAD_PROGRESS",
      "UPLOAD_COMPLETE",
      "UPLOAD_ERROR",
      "UPLOAD_PAUSED",
      "UPLOAD_CANCELLED",
      "UPLOAD_STATUS",
      "CHUNK_UPLOADED",
      "RETRYING_CHUNK",
      "INITIATE_UPLOAD_RESPONSE",
      "LOG",
    ].includes((message as any).type)
  );
}
