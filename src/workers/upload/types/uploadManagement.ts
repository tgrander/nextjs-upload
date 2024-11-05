// ====================
// Common Types
// ====================

export type UploadStatus =
  | "pending"
  | "in_progress"
  | "paused"
  | "completed"
  | "error"
  | "cancelled"
  | "not_found";

export const UploadStatusLabels: Record<UploadStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  paused: "Paused",
  completed: "Completed",
  error: "Error",
  cancelled: "Cancelled",
  not_found: "Not Found",
};

// ====================
// Upload Management
// ====================

export interface UploadState {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  uploadId: string;
  key: string;
  progress: number;
  status: UploadStatus;
  parts: UploadPart[];
  startTime: number;
  error?: string;
  fileUrl?: string;
  abortController?: AbortController;
  contentId?: string;
  partSize: number;
  maxConcurrentUploads: number;
  accelerated?: boolean;
}

export interface UploadPart {
  partNumber: number;
  eTag: string;
  size?: number;
}

export interface UploadChunk {
  id: string;
  uploadId: string;
  etag: string;
  partNumber: number;
  size: number;
  data: Blob;
  status: "pending" | "uploading" | "completed" | "failed";
  attempts: number;
  lastAttempt?: number;
  error?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
}

export interface ChunkConfig {
  size: number;
  concurrent: number;
}

export interface WorkerErrorDetails {
  code: string;
  message: string;
  retryable: boolean;
  partNumber?: number;
  attempts?: number;
}

export interface ResumeData {
  uploadedParts: UploadPart[];
  nextPartNumber: number;
  uploadedBytes: number;
}

// ====================
// File Records
// ====================

export interface FileRecord {
  id: string;
  file: File;
  type: string | null;
}

export interface FileRecordIndexedDB {
  id: string;
  arrayBuffer: ArrayBuffer;
  name: string;
  type: string;
  lastModified: number;
}

// ====================
// API Responses
// ====================

export interface InitiateUploadResponse {
  uploadId: string;
  key: string;
  content: {
    id: string;
  };
  accelerationEndpoint?: string;
}

export interface SignedUrlResponse {
  partNumber: number;
  signedUrl: string;
}

export interface CompleteMultipartUploadRequest {
  key: string;
  uploadId: string;
  contentId: string;
  parts: UploadPart[];
}

export interface CompleteMultipartUploadResponse {
  location: string;
}

// ====================
// Configuration Types
// ====================

export interface UploadConfig {
  partSize: number;
  maxConcurrentUploads: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface ApiClientConfig {
  baseUrl: string;
  timeout: number;
}

export interface UploadPartParams {
  key: string;
  uploadId: string;
  partNumber: number;
  chunk: Blob;
}

export interface SignedUrlParams {
  partNumber: number;
  uploadId: string;
  key: string;
}

export interface PauseUploadParams {
  key: string;
  uploadId: string;
}

export interface CancelUploadParams {
  key: string;
  uploadId: string;
}

// ====================
// Upload Queue and Manager
// ====================

export interface UploadQueueItem {
  uploadId: string;
  partNumber: number;
}

export interface UploadManagerState {
  activeUploads: Set<string>;
  queue: UploadQueueItem[];
}
