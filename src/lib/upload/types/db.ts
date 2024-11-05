import { UploadState, UploadStatus } from "./uploadManagement";

export interface UploadDB {
  uploads: {
    key: string;
    value: UploadState;
    indexes: { "by-status": UploadStatus };
  };
  uploadQueue: {
    key: string;
    value: { id: string; priority: number };
  };
  files: {
    key: string;
    value: File;
  };
}
