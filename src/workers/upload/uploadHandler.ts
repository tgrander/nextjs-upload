// uploadHandler.ts

import {
  ChunkUploadedMessage,
  ResumeUploadMessage,
  RetryingChunkMessage,
  StartUploadMessage,
  UploadCancelledMessage,
  UploadCompleteMessage,
  UploadErrorMessage,
  UploadPart,
  UploadPausedMessage,
  UploadProgressMessage,
  UploadState,
  UploadStatusMessage,
  WorkerOutboundMessage,
} from "./types";
import { broadcast, broadcastLog } from "./logger";

import { ApiClient } from "./apiClient";
import { CONFIG } from "./config";
import { RetryableError } from "@/lib/errors";
import { databaseService } from "./databaseService";

// Map to keep track of active uploads
const activeUploads = new Map<string, ActiveUpload>();

interface ActiveUpload {
  state: UploadState;
  controller: AbortController;
}

export class UploadHandler {
  private apiClient: ApiClient;

  constructor() {
    this.apiClient = new ApiClient(CONFIG.API_BASE_URL, CONFIG.API_TIMEOUT);
  }

  /**
   * Loads ongoing uploads from the database and resumes them if necessary.
   */
  async loadOngoingUploads(): Promise<void> {
    const allUploadStates = await databaseService.loadAllUploadStates();
    for (const state of allUploadStates) {
      if (state.status === "in_progress") {
        await this.resumeUpload(state);
      }
    }
  }

  /**
   * Handles the upload process for START_UPLOAD and RESUME_UPLOAD messages.
   */
  async handleUpload(
    message: StartUploadMessage | ResumeUploadMessage
  ): Promise<void> {
    let uploadState: UploadState;

    if (message.type === "RESUME_UPLOAD") {
      uploadState = await this.getUploadStateForResume(message.contentId);
    } else {
      uploadState = await this.initializeNewUpload(message);
    }

    if (!uploadState.contentId) {
      throw new Error("Upload state has no contentId");
    }

    // Set up upload tracking
    const controller = new AbortController();
    activeUploads.set(uploadState.contentId, {
      state: uploadState,
      controller,
    });

    await databaseService.saveUploadState(uploadState);

    // Proceed with uploading parts
    await this.uploadParts(uploadState, controller.signal);
  }

  /**
   * Initializes a new upload and returns the upload state.
   */
  private async initializeNewUpload(
    message: StartUploadMessage
  ): Promise<UploadState> {
    const { file, duration, fileType, chunkConfig } = message;
    const contentId = crypto.randomUUID();

    broadcastLog(`Starting upload for contentId: ${contentId}`, "info");

    // Initiate upload
    const { uploadId, key, content } =
      await this.apiClient.initiateMultipartUpload(file, duration, fileType);

    broadcast({
      type: "INITIATE_UPLOAD_RESPONSE",
      contentId,
      uploadId,
      key,
    } as WorkerOutboundMessage);

    const partSize = chunkConfig?.size ?? CONFIG.PART_SIZE;
    const maxConcurrentUploads =
      chunkConfig?.concurrent ?? CONFIG.MAX_CONCURRENT_UPLOADS;

    const uploadState: UploadState = {
      id: content.id,
      file,
      fileName: file.name,
      fileSize: file.size,
      uploadId,
      key,
      progress: 0,
      status: "in_progress",
      parts: [],
      startTime: Date.now(),
      contentId: content.id,
      partSize,
      maxConcurrentUploads,
    };

    return uploadState;
  }

  /**
   * Retrieves the upload state for a resume operation.
   */
  private async getUploadStateForResume(
    contentId: string
  ): Promise<UploadState> {
    const state = await databaseService.loadUploadState(contentId);
    if (!state) {
      throw new Error("No upload state found to resume");
    }

    broadcastLog(`Resuming upload with uploadId: ${state.uploadId}`, "info");
    return state;
  }

  /**
   * Uploads the parts of the file.
   */
  private async uploadParts(
    uploadState: UploadState,
    abortSignal: AbortSignal
  ): Promise<void> {
    const { file, key, uploadId, contentId, partSize } = uploadState;

    if (!contentId) {
      throw new Error("Upload state has no contentId");
    }

    const totalParts = Math.ceil(file.size / partSize);
    broadcastLog(`Total parts to upload: ${totalParts}`, "info");

    // Retrieve list of already uploaded parts
    const uploadedParts = await this.getUploadedParts(uploadState);

    const uploadedPartNumbers = new Set(
      uploadedParts.map((part) => part.partNumber)
    );
    let completedParts = uploadedParts.length;

    // Upload remaining parts
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      if (uploadedPartNumbers.has(partNumber)) {
        broadcastLog(`Skipping already uploaded part ${partNumber}`, "info");
        continue;
      }

      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const chunk = file.slice(start, end);

      try {
        const part = await this.uploadPart(
          contentId,
          key,
          uploadId,
          partNumber,
          chunk,
          abortSignal
        );

        uploadState.parts.push(part);
        completedParts++;

        const progress = Math.round((completedParts / totalParts) * 100);
        uploadState.progress = progress;

        await databaseService.saveUploadState(uploadState);
        this.broadcastProgress(
          contentId,
          progress,
          completedParts,
          uploadState
        );
      } catch (error) {
        await this.handleUploadError(contentId, error);
        throw error; // Stop uploading on error
      }
    }

    // Complete the upload
    await this.completeUpload(uploadState);
  }

  /**
   * Retrieves the list of uploaded parts from the API.
   */
  private async getUploadedParts(
    uploadState: UploadState
  ): Promise<UploadPart[]> {
    try {
      const parts = await this.apiClient.listUploadedParts(
        uploadState.key,
        uploadState.uploadId
      );
      broadcastLog(`Retrieved ${parts.length} uploaded parts`, "info");
      return parts;
    } catch (error) {
      broadcastLog(
        `Failed to retrieve uploaded parts: ${(error as Error).message}`,
        "error"
      );
      return [];
    }
  }

  /**
   * Uploads a single part of the file.
   */
  private async uploadPart(
    contentId: string,
    key: string,
    uploadId: string,
    partNumber: number,
    chunk: Blob,
    abortSignal: AbortSignal,
    retryCount = 0
  ): Promise<UploadPart> {
    try {
      const part = await this.apiClient.uploadPart(
        key,
        uploadId,
        partNumber,
        chunk,
        abortSignal
      );

      broadcast({
        type: "CHUNK_UPLOADED",
        contentId,
        partNumber,
        size: chunk.size,
      } as ChunkUploadedMessage);

      return {
        partNumber,
        eTag: part.eTag,
        size: chunk.size,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (
        retryCount < CONFIG.RETRY.ATTEMPTS &&
        error instanceof RetryableError &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);

        broadcast({
          type: "RETRYING_CHUNK",
          contentId,
          partNumber,
          attempt: retryCount + 1,
          maxAttempts: CONFIG.RETRY.ATTEMPTS,
          error: errorMessage,
          nextAttemptDelay: delay,
        } as RetryingChunkMessage);

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.uploadPart(
          contentId,
          key,
          uploadId,
          partNumber,
          chunk,
          abortSignal,
          retryCount + 1
        );
      }

      throw error;
    }
  }

  /**
   * Broadcasts upload progress to the main thread.
   */
  private broadcastProgress(
    contentId: string,
    progress: number,
    completedParts: number,
    uploadState: UploadState
  ): void {
    const message: UploadProgressMessage = {
      type: "UPLOAD_PROGRESS",
      contentId,
      progress,
      uploadedBytes: completedParts * uploadState.partSize,
      totalBytes: uploadState.fileSize,
    };

    broadcast(message);
  }

  /**
   * Completes the upload process.
   */
  private async completeUpload(uploadState: UploadState): Promise<void> {
    const { contentId, key, uploadId, parts, startTime, fileSize } =
      uploadState;

    if (!contentId) {
      throw new Error("Upload state has no contentId");
    }

    broadcastLog(`Completing upload for contentId: ${contentId}`, "info");

    const completeResponse = await this.apiClient.completeMultipartUpload(
      key,
      uploadId,
      contentId,
      parts
    );

    uploadState.status = "completed";
    uploadState.fileUrl = completeResponse.location;
    await databaseService.saveUploadState(uploadState);

    broadcast({
      type: "UPLOAD_COMPLETE",
      contentId,
      fileUrl: completeResponse.location,
      duration: Date.now() - startTime,
      totalBytes: fileSize,
      averageSpeed: fileSize / (Date.now() - startTime),
    } as UploadCompleteMessage);

    activeUploads.delete(contentId);
    broadcastLog(`Upload completed for contentId: ${contentId}`, "info");
  }

  /**
   * Handles errors during the upload process.
   */
  private async handleUploadError(
    contentId: string,
    error: unknown
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const isRetryable = error instanceof RetryableError;

    broadcast({
      type: "UPLOAD_ERROR",
      contentId,
      error: {
        code: "UPLOAD_FAILED",
        message: errorMessage,
        retryable: isRetryable,
      },
    } as UploadErrorMessage);

    const upload = activeUploads.get(contentId);
    if (upload) {
      upload.state.status = "error";
      upload.state.error = errorMessage;
      await databaseService.saveUploadState(upload.state);
      activeUploads.delete(contentId);
    }
  }

  /**
   * Pauses an ongoing upload.
   */
  async handlePause(contentId: string): Promise<void> {
    const upload = activeUploads.get(contentId);
    if (!upload) return;

    upload.controller.abort();
    upload.state.status = "paused";
    await databaseService.saveUploadState(upload.state);

    broadcast({
      type: "UPLOAD_PAUSED",
      contentId,
    } as UploadPausedMessage);

    activeUploads.delete(contentId);
  }

  /**
   * Resumes a paused upload.
   */
  async handleResume(contentId: string): Promise<void> {
    try {
      const uploadState = await databaseService.loadUploadState(contentId);
      if (!uploadState || uploadState.status !== "paused") {
        broadcastLog(
          `No paused upload found for contentId: ${contentId}`,
          "error"
        );
        return;
      }

      uploadState.status = "in_progress";
      await databaseService.saveUploadState(uploadState);

      await this.handleUpload({ type: "RESUME_UPLOAD", contentId });
    } catch (error) {
      await this.handleUploadError(contentId, error);
    }
  }

  /**
   * Cancels an ongoing upload.
   */
  async handleCancel(contentId: string): Promise<void> {
    const upload = activeUploads.get(contentId);
    if (!upload) return;

    upload.controller.abort();

    await databaseService.deleteUploadState(contentId);
    await databaseService.deleteChunks(upload.state.uploadId);

    try {
      await this.apiClient.cancelUpload(
        upload.state.key,
        upload.state.uploadId,
        contentId
      );
      broadcastLog(
        `Successfully cancelled upload for contentId: ${contentId}`,
        "info"
      );
    } catch (error) {
      broadcastLog(
        `Error cancelling upload for contentId: ${contentId}: ${
          (error as Error).message
        }`,
        "error"
      );
    }

    broadcast({
      type: "UPLOAD_CANCELLED",
      contentId,
    } as UploadCancelledMessage);

    activeUploads.delete(contentId);
  }

  /**
   * Handles GET_ACTIVE_UPLOADS message.
   */
  async handleGetActiveUploads(): Promise<void> {
    const uploads = await databaseService.loadAllUploadStates();

    for (const upload of uploads) {
      if (upload.status === "in_progress" || upload.status === "paused") {
        await this.resumeUpload(upload);
        broadcast({
          type: "UPLOAD_STATUS",
          contentId: upload.contentId,
          status: upload.status,
        } as UploadStatusMessage);
      }
    }
  }

  /**
   * Handles GET_UPLOAD_STATUS message.
   */
  async handleGetUploadStatus(contentId: string): Promise<void> {
    const state = await databaseService.loadUploadState(contentId);
    if (state) {
      broadcast({
        type: "UPLOAD_STATUS",
        contentId,
        status: state.status,
      } as UploadStatusMessage);
    } else {
      broadcast({
        type: "UPLOAD_STATUS",
        contentId,
        status: "not_found",
      } as UploadStatusMessage);
    }
  }

  /**
   * Resumes an upload using the existing upload state.
   */
  private async resumeUpload(uploadState: UploadState): Promise<void> {
    const contentId = uploadState.contentId;
    if (!contentId) {
      throw new Error("Upload state has no contentId");
    }
    if (activeUploads.has(contentId)) {
      // Upload is already in progress
      return;
    }

    const controller = new AbortController();
    activeUploads.set(contentId, { state: uploadState, controller });

    await this.uploadParts(uploadState, controller.signal);
  }

  /**
   * Resumes all paused uploads.
   */
  public async resumeAllUploads(): Promise<void> {
    const allUploadStates = await databaseService.loadAllUploadStates();
    for (const state of allUploadStates) {
      if (state.status === "paused" || state.status === "in_progress") {
        await this.resumeUpload(state);
      }
    }
  }
}
