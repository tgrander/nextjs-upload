// apiClient.ts

import {
  CompleteMultipartUploadResponse,
  InitiateUploadResponse,
  SignedUrlResponse,
  UploadPart,
} from "./types";
import { FatalError, RetryableError } from "@/lib/errors";

import { CONFIG } from "@/lib/upload/config";

export class ApiClient {
  private baseUrl: string;
  private timeout: number;
  private accelerationEndpoint: string | null = null;

  constructor(baseUrl: string, timeout: number) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Initiates a multipart upload session.
   */
  async initiateMultipartUpload(
    file: File,
    videoDuration: number,
    fileType: string
  ): Promise<InitiateUploadResponse> {
    const useAcceleration = this.shouldUseAcceleration(file.size);

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/upload/multipart/initiate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType,
          size: file.size,
          duration: videoDuration,
          useAcceleration,
        }),
      }
    );

    if (!response.ok) {
      throw new FatalError("Failed to initiate multipart upload");
    }

    const data = (await response.json()) as InitiateUploadResponse;

    if (data.accelerationEndpoint) {
      this.accelerationEndpoint = data.accelerationEndpoint;
    }

    return data;
  }

  /**
   * Gets a signed URL for uploading a specific part.
   */
  async getSignedUrl(
    partNumber: number,
    uploadId: string,
    key: string
  ): Promise<string> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/upload/multipart/signed-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partNumber,
          uploadId,
          key,
          useAcceleration: !!this.accelerationEndpoint,
        }),
      }
    );

    if (!response.ok) {
      throw new RetryableError("Failed to get signed URL");
    }

    const data = (await response.json()) as SignedUrlResponse;
    return data.signedUrl;
  }

  /**
   * Uploads a single part of the file to S3.
   */
  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    chunk: Blob,
    abortSignal: AbortSignal
  ): Promise<UploadPart> {
    const signedUrl = await this.getSignedUrl(partNumber, uploadId, key);
    const uploadUrl = this.transformToAcceleratedUrl(signedUrl);

    const response = await this.fetchWithRetry(
      uploadUrl,
      {
        method: "PUT",
        body: chunk,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": chunk.size.toString(),
        },
      },
      CONFIG.RETRY.ATTEMPTS,
      abortSignal
    );

    if (!response.ok) {
      throw new RetryableError(`Failed to upload part ${partNumber}`);
    }

    const eTag = response.headers.get("ETag");
    if (!eTag) {
      throw new Error(`No ETag received for part ${partNumber}`);
    }

    return {
      partNumber,
      eTag: eTag.replace(/"/g, ""),
      size: chunk.size,
    };
  }

  /**
   * Completes the multipart upload session.
   */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    contentId: string,
    parts: UploadPart[]
  ): Promise<CompleteMultipartUploadResponse> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/upload/multipart/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          uploadId,
          contentId,
          parts,
          useAcceleration: !!this.accelerationEndpoint,
        }),
      }
    );

    if (!response.ok) {
      throw new FatalError("Failed to complete multipart upload");
    }

    const data = (await response.json()) as CompleteMultipartUploadResponse;
    return data;
  }

  /**
   * Cancels the multipart upload session.
   */
  async cancelUpload(
    key: string,
    uploadId: string,
    contentId: string
  ): Promise<void> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/upload/multipart/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          uploadId,
          contentId,
          useAcceleration: !!this.accelerationEndpoint,
        }),
      }
    );

    if (!response.ok) {
      throw new RetryableError("Failed to cancel multipart upload");
    }
  }

  /**
   * Lists the parts that have been uploaded so far.
   */
  async listUploadedParts(
    key: string,
    uploadId: string
  ): Promise<UploadPart[]> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/upload/multipart/list-parts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          uploadId,
        }),
      }
    );

    if (!response.ok) {
      throw new RetryableError("Failed to list uploaded parts");
    }

    const data = (await response.json()) as { parts: UploadPart[] };
    return data.parts;
  }

  // ====================
  // Private Helper Methods
  // ====================

  /**
   * Determines whether to use S3 Transfer Acceleration based on file size.
   */
  private shouldUseAcceleration(fileSize: number): boolean {
    return (
      CONFIG.S3_TRANSFER_ACCELERATION.ENABLED &&
      fileSize >= CONFIG.S3_TRANSFER_ACCELERATION.MIN_SIZE
    );
  }

  /**
   * Transforms a standard S3 URL to an accelerated URL if applicable.
   */
  private transformToAcceleratedUrl(url: string): string {
    if (!this.accelerationEndpoint) {
      return url;
    }

    return url.replace(
      /\.s3\.([^.]+)\.amazonaws\.com/,
      `.${this.accelerationEndpoint}`
    );
  }

  /**
   * Combines multiple AbortSignals into one.
   */
  private combineAbortSignals(
    signals: (AbortSignal | undefined)[]
  ): AbortSignal {
    const controller = new AbortController();

    signals.forEach((signal) => {
      if (signal) {
        if (signal.aborted) {
          controller.abort();
        } else {
          signal.addEventListener("abort", () => controller.abort());
        }
      }
    });

    return controller.signal;
  }

  /**
   * Fetch with timeout and optional abort signal.
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    abortSignal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController();
    const signal = this.combineAbortSignals([controller.signal, abortSignal]);
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, { ...options, signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new RetryableError("Request timed out");
      }
      throw error;
    }
  }

  /**
   * Fetch with retry logic for retryable errors.
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries: number = CONFIG.RETRY.ATTEMPTS,
    abortSignal?: AbortSignal
  ): Promise<Response> {
    try {
      return await this.fetchWithTimeout(url, options, abortSignal);
    } catch (error) {
      if (retries > 0 && error instanceof RetryableError) {
        await new Promise((resolve) => setTimeout(resolve, CONFIG.RETRY.DELAY));
        return this.fetchWithRetry(url, options, retries - 1, abortSignal);
      }
      throw error;
    }
  }
}
