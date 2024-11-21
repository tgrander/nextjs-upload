// types.ts
export type FileStatus =
  | "idle"
  | "selected"
  | "validating"
  | "preparing"
  | "uploading"
  | "paused"
  | "retrying"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export interface UploadChunk {
  id: string;
  index: number;
  start: number;
  end: number;
  size: number;
  status: "pending" | "uploading" | "completed" | "failed";
  attempts: number;
  uploadedAt?: Date;
}

export interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: FileStatus;
  progress: number;
  uploadedSize: number;
  chunks: UploadChunk[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  uploadId?: string; // S3 multipart upload ID
  sessionId: string;
  checksum?: string;
}

export interface UploadStats {
  speed: number; // bytes per second
  timeRemaining: number; // seconds
  averageSpeed: number;
  startedAt?: Date;
  pausedAt?: Date;
  totalPausedTime: number;
}

import { devtools, persist } from "zustand/middleware";

// uploadStore.ts
import { create } from "zustand";

interface UploadStore {
  files: Record<string, UploadFile>;
  activeUploads: string[];
  queuedUploads: string[];

  // Actions
  addFile: (file: File) => Promise<string>;
  removeFile: (fileId: string) => void;
  updateFileStatus: (fileId: string, status: FileStatus) => void;
  updateFileProgress: (fileId: string, progress: number) => void;
  updateChunkStatus: (
    fileId: string,
    chunkId: string,
    status: UploadChunk["status"]
  ) => void;
  setFileError: (fileId: string, error: string) => void;
  clearError: (fileId: string) => void;

  // Queue management
  queueFile: (fileId: string) => void;
  dequeueFile: (fileId: string) => void;
  reorderQueue: (fileId: string, newPosition: number) => void;

  // Batch actions
  pauseAll: () => void;
  resumeAll: () => void;
  cancelAll: () => void;
  removeCompleted: () => void;
}

export const useUploadStore = create<UploadStore>()(
  devtools(
    persist(
      (set, get) => ({
        files: {},
        activeUploads: [],
        queuedUploads: [],

        addFile: async (file) => {
          const fileId = crypto.randomUUID();
          const newFile: UploadFile = {
            id: fileId,
            file,
            name: file.name,
            size: file.size,
            type: file.type,
            status: "selected",
            progress: 0,
            uploadedSize: 0,
            chunks: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            sessionId: crypto.randomUUID(),
          };

          set((state) => ({
            files: { ...state.files, [fileId]: newFile },
          }));

          return fileId;
        },

        removeFile: (fileId) => {
          set((state) => {
            const { [fileId]: removed, ...remainingFiles } = state.files;
            return {
              files: remainingFiles,
              activeUploads: state.activeUploads.filter((id) => id !== fileId),
              queuedUploads: state.queuedUploads.filter((id) => id !== fileId),
            };
          });
        },

        updateFileStatus: (fileId, status) => {
          set((state) => ({
            files: {
              ...state.files,
              [fileId]: {
                ...state.files[fileId],
                status,
                updatedAt: new Date(),
              },
            },
          }));
        },

        updateFileProgress: (fileId, progress) => {
          set((state) => ({
            files: {
              ...state.files,
              [fileId]: {
                ...state.files[fileId],
                progress,
                uploadedSize: Math.floor(
                  state.files[fileId].size * (progress / 100)
                ),
                updatedAt: new Date(),
              },
            },
          }));
        },

        updateChunkStatus: (fileId, chunkId, status) => {
          set((state) => ({
            files: {
              ...state.files,
              [fileId]: {
                ...state.files[fileId],
                chunks: state.files[fileId].chunks.map((chunk) =>
                  chunk.id === chunkId
                    ? {
                        ...chunk,
                        status,
                        uploadedAt:
                          status === "completed"
                            ? new Date()
                            : chunk.uploadedAt,
                      }
                    : chunk
                ),
                updatedAt: new Date(),
              },
            },
          }));
        },

        setFileError: (fileId, error) => {
          set((state) => ({
            files: {
              ...state.files,
              [fileId]: {
                ...state.files[fileId],
                error,
                status: "failed",
                updatedAt: new Date(),
              },
            },
          }));
        },

        clearError: (fileId) => {
          set((state) => ({
            files: {
              ...state.files,
              [fileId]: {
                ...state.files[fileId],
                error: undefined,
                updatedAt: new Date(),
              },
            },
          }));
        },

        queueFile: (fileId) => {
          set((state) => ({
            queuedUploads: [...state.queuedUploads, fileId],
          }));
        },

        dequeueFile: (fileId) => {
          set((state) => ({
            queuedUploads: state.queuedUploads.filter((id) => id !== fileId),
          }));
        },

        reorderQueue: (fileId, newPosition) => {
          set((state) => {
            const newQueue = state.queuedUploads.filter((id) => id !== fileId);
            newQueue.splice(newPosition, 0, fileId);
            return { queuedUploads: newQueue };
          });
        },

        pauseAll: () => {
          set((state) => ({
            files: Object.fromEntries(
              Object.entries(state.files).map(([id, file]) => [
                id,
                file.status === "uploading"
                  ? { ...file, status: "paused", updatedAt: new Date() }
                  : file,
              ])
            ),
          }));
        },

        resumeAll: () => {
          set((state) => ({
            files: Object.fromEntries(
              Object.entries(state.files).map(([id, file]) => [
                id,
                file.status === "paused"
                  ? { ...file, status: "uploading", updatedAt: new Date() }
                  : file,
              ])
            ),
          }));
        },

        cancelAll: () => {
          set((state) => ({
            files: Object.fromEntries(
              Object.entries(state.files).map(([id, file]) => [
                id,
                ["uploading", "paused", "selected", "preparing"].includes(
                  file.status
                )
                  ? { ...file, status: "cancelled", updatedAt: new Date() }
                  : file,
              ])
            ),
            activeUploads: [],
            queuedUploads: [],
          }));
        },

        removeCompleted: () => {
          set((state) => ({
            files: Object.fromEntries(
              Object.entries(state.files).filter(
                ([_, file]) => file.status !== "completed"
              )
            ),
          }));
        },
      }),
      {
        name: "upload-store",
        partialize: (state) => ({
          files: Object.fromEntries(
            Object.entries(state.files).filter(([_, file]) =>
              ["paused", "failed"].includes(file.status)
            )
          ),
        }),
      }
    )
  )
);

// statsStore.ts
interface StatsStore {
  stats: Record<string, UploadStats>;

  // Actions
  updateSpeed: (fileId: string, speed: number) => void;
  updateTimeRemaining: (fileId: string, timeRemaining: number) => void;
  recordPause: (fileId: string) => void;
  recordResume: (fileId: string) => void;
  clearStats: (fileId: string) => void;
}

export const useStatsStore = create<StatsStore>()(
  devtools((set) => ({
    stats: {},

    updateSpeed: (fileId, speed) => {
      set((state) => ({
        stats: {
          ...state.stats,
          [fileId]: {
            ...state.stats[fileId],
            speed,
            averageSpeed: state.stats[fileId]
              ? (state.stats[fileId].averageSpeed + speed) / 2
              : speed,
          },
        },
      }));
    },

    updateTimeRemaining: (fileId, timeRemaining) => {
      set((state) => ({
        stats: {
          ...state.stats,
          [fileId]: {
            ...state.stats[fileId],
            timeRemaining,
          },
        },
      }));
    },

    recordPause: (fileId) => {
      set((state) => ({
        stats: {
          ...state.stats,
          [fileId]: {
            ...state.stats[fileId],
            pausedAt: new Date(),
          },
        },
      }));
    },

    recordResume: (fileId) => {
      set((state) => ({
        stats: {
          ...state.stats,
          [fileId]: {
            ...state.stats[fileId],
            totalPausedTime:
              state.stats[fileId].totalPausedTime +
              (state.stats[fileId].pausedAt
                ? new Date().getTime() - state.stats[fileId].pausedAt.getTime()
                : 0),
            pausedAt: undefined,
          },
        },
      }));
    },

    clearStats: (fileId) => {
      set((state) => {
        const { [fileId]: removed, ...remainingStats } = state.stats;
        return { stats: remainingStats };
      });
    },
  }))
);

// configStore.ts
interface UploadConfig {
  maxConcurrentUploads: number;
  chunkSize: number;
  maxRetries: number;
  retryDelay: number;
  allowedFileTypes: string[];
  maxFileSize: number;
  resumableUploads: boolean;
}

interface ConfigStore {
  config: UploadConfig;
  updateConfig: (config: Partial<UploadConfig>) => void;
}

export const useConfigStore = create<ConfigStore>()(
  devtools(
    persist(
      (set) => ({
        config: {
          maxConcurrentUploads: 3,
          chunkSize: 5 * 1024 * 1024, // 5MB
          maxRetries: 3,
          retryDelay: 1000,
          allowedFileTypes: ["*"],
          maxFileSize: 1024 * 1024 * 1024, // 1GB
          resumableUploads: true,
        },

        updateConfig: (newConfig) => {
          set((state) => ({
            config: { ...state.config, ...newConfig },
          }));
        },
      }),
      {
        name: "upload-config",
      }
    )
  )
);
