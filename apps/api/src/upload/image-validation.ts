import sharp from "sharp";

import type { ArtworkMimeType } from "./upload.types.js";

export const MAX_ARTWORK_PIXELS = 40_000_000;

const expectedFormat: Record<ArtworkMimeType, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export type UploadedImageFailureCode =
  | "UPLOAD_CONTENT_INVALID"
  | "UPLOAD_CONTENT_TYPE_MISMATCH"
  | "UPLOAD_DIMENSIONS_MISMATCH";

export class UploadedImageValidationError extends Error {
  constructor(
    readonly code: UploadedImageFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "UploadedImageValidationError";
  }
}

export async function validateUploadedImage(
  bytes: Uint8Array,
  expected: {
    height: number;
    mimeType: ArtworkMimeType;
    width: number;
  },
): Promise<void> {
  try {
    const image = sharp(bytes, {
      animated: true,
      failOn: "error",
      limitInputPixels: MAX_ARTWORK_PIXELS,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    if (metadata.format !== expectedFormat[expected.mimeType]) {
      throw new UploadedImageValidationError(
        "UPLOAD_CONTENT_TYPE_MISMATCH",
        "图片文件头与声明格式不一致，请重新上传。",
      );
    }
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
      throw new UploadedImageValidationError(
        "UPLOAD_CONTENT_INVALID",
        "图片必须是可解析的单帧位图。",
      );
    }

    const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    const width = swapsDimensions ? metadata.height : metadata.width;
    const height = swapsDimensions ? metadata.width : metadata.height;
    if (width !== expected.width || height !== expected.height) {
      throw new UploadedImageValidationError(
        "UPLOAD_DIMENSIONS_MISMATCH",
        "图片真实尺寸与上传声明不一致，请重新选择图片。",
      );
    }

    // A metadata read alone can accept a truncated payload. Force a complete
    // decode before the object is admitted to the analysis queue.
    await image.rotate().resize({ height: 1, width: 1 }).toBuffer();
  } catch (error: unknown) {
    if (error instanceof UploadedImageValidationError) throw error;
    throw new UploadedImageValidationError(
      "UPLOAD_CONTENT_INVALID",
      "图片内容无法安全解析，请重新拍摄或选择其他图片。",
    );
  }
}
