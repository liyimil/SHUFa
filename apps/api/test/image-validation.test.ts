import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import {
  UploadedImageValidationError,
  validateUploadedImage,
} from "../src/upload/image-validation.js";

async function createImage(format: "jpeg" | "png" | "webp") {
  const image = sharp({
    create: {
      background: "white",
      channels: 3,
      height: 320,
      width: 256,
    },
  });
  return image[format]().toBuffer();
}

describe("uploaded image validation", () => {
  it("fully decodes a valid declared raster image", async () => {
    const bytes = await createImage("jpeg");

    await validateUploadedImage(bytes, {
      height: 320,
      mimeType: "image/jpeg",
      width: 256,
    });
  });

  it("rejects a file header that does not match the declared MIME type", async () => {
    const bytes = await createImage("png");

    await assert.rejects(
      () =>
        validateUploadedImage(bytes, {
          height: 320,
          mimeType: "image/jpeg",
          width: 256,
        }),
      (error: unknown) =>
        error instanceof UploadedImageValidationError &&
        error.code === "UPLOAD_CONTENT_TYPE_MISMATCH",
    );
  });

  it("rejects dimensions that do not match the decoded image", async () => {
    const bytes = await createImage("webp");

    await assert.rejects(
      () =>
        validateUploadedImage(bytes, {
          height: 256,
          mimeType: "image/webp",
          width: 320,
        }),
      (error: unknown) =>
        error instanceof UploadedImageValidationError &&
        error.code === "UPLOAD_DIMENSIONS_MISMATCH",
    );
  });

  it("rejects a truncated image even when its magic bytes look valid", async () => {
    const bytes = (await createImage("jpeg")).subarray(0, 32);

    await assert.rejects(
      () =>
        validateUploadedImage(bytes, {
          height: 320,
          mimeType: "image/jpeg",
          width: 256,
        }),
      (error: unknown) =>
        error instanceof UploadedImageValidationError &&
        error.code === "UPLOAD_CONTENT_INVALID",
    );
  });
});
