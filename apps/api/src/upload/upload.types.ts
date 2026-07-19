export const allowedArtworkMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ArtworkMimeType = (typeof allowedArtworkMimeTypes)[number];

export interface CreateUploadInput {
  clientRequestId: string;
  height: number;
  mimeType: ArtworkMimeType;
  sizeBytes: number;
  width: number;
}

export interface CreateUploadResult {
  artworkId: string;
  expiresAt: string;
  requiredHeaders: {
    "content-type": ArtworkMimeType;
  };
  uploadId: string;
  uploadUrl: string;
}

export interface CompleteUploadResult {
  artworkId: string;
  analysisId: string;
  status: "PROCESSING";
  uploadedAt: string;
}

export interface CancelUploadResult {
  artworkId: string;
  status: "DELETED";
  uploadId: string;
}
