import type { ArtworkMimeType } from "./upload.types.js";

export const UPLOAD_REPOSITORY = Symbol("UPLOAD_REPOSITORY");

export interface PendingUploadRecord {
  artworkId: string;
  expiresAt: Date;
  height: number;
  mimeType: ArtworkMimeType;
  objectKey: string;
  sizeBytes: number;
  status:
    | "PENDING_UPLOAD"
    | "UPLOADED"
    | "PROCESSING"
    | "READY"
    | "FAILED"
    | "DELETION_PENDING"
    | "DELETED";
  uploadId: string;
  width: number;
}

export interface UploadRepository {
  claimPendingUploadCancellation(
    uploadId: string,
    userId: string,
  ): Promise<{ artworkId: string; objectKey: string } | null>;
  finishPendingUploadCancellation(
    uploadId: string,
    userId: string,
  ): Promise<boolean>;
  createPendingUpload(input: {
    clientRequestId: string;
    expiresAt: Date;
    height: number;
    mimeType: ArtworkMimeType;
    objectKey: string;
    sizeBytes: number;
    userId: string;
    width: number;
  }): Promise<{
    artworkId: string;
    expiresAt: Date;
    mimeType: ArtworkMimeType;
    objectKey: string;
    uploadId: string;
  } | null>;
  findOwnedUpload(
    uploadId: string,
    userId: string,
  ): Promise<PendingUploadRecord | null>;
  markUploaded(
    uploadId: string,
    userId: string,
    uploadedAt: Date,
  ): Promise<{
    analysisId: string;
    artworkId: string;
    mimeType: ArtworkMimeType;
    objectKey: string;
  } | null>;
}
