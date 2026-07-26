export const glyphCropQueueName = "content-glyph-crop-v1";

export interface GlyphCropJob {
  bboxHeight: number;
  bboxWidth: number;
  bboxX: number;
  bboxY: number;
  glyphId: string;
  mimeType: string;
  outputObjectKey: string;
  sourceObjectKey: string;
}

export interface GlyphCropDependencies {
  aiServiceUrl: string;
  apiBaseUrl: string;
  downloadObject(objectKey: string): Promise<Uint8Array>;
  fetcher: typeof fetch;
  internalToken: string;
  uploadPublicObject(input: {
    body: Uint8Array;
    checksum: string;
    objectKey: string;
  }): Promise<void>;
}

function normalized(value: string): string {
  return value.replace(/\/$/, "");
}

export async function processGlyphCrop(
  job: GlyphCropJob,
  dependencies: GlyphCropDependencies,
): Promise<void> {
  const source = Uint8Array.from(
    await dependencies.downloadObject(job.sourceObjectKey),
  );
  const form = new FormData();
  form.append(
    "file",
    new Blob([source.buffer], { type: job.mimeType }),
    "source",
  );
  form.append("bbox_x", String(job.bboxX));
  form.append("bbox_y", String(job.bboxY));
  form.append("bbox_width", String(job.bboxWidth));
  form.append("bbox_height", String(job.bboxHeight));

  const cropResponse = await dependencies.fetcher(
    `${normalized(dependencies.aiServiceUrl)}/v1/glyph-crop`,
    {
      body: form,
      headers: { "X-Request-Id": job.glyphId },
      method: "POST",
    },
  );
  if (!cropResponse.ok) {
    throw new Error(`Glyph crop failed (${cropResponse.status}).`);
  }
  const checksum = cropResponse.headers.get("x-content-sha256") ?? "";
  const width = Number(cropResponse.headers.get("x-image-width"));
  const height = Number(cropResponse.headers.get("x-image-height"));
  if (
    !/^[0-9a-f]{64}$/.test(checksum) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Glyph crop response metadata is invalid.");
  }
  const body = new Uint8Array(await cropResponse.arrayBuffer());
  await dependencies.uploadPublicObject({
    body,
    checksum,
    objectKey: job.outputObjectKey,
  });

  const callback = await dependencies.fetcher(
    `${normalized(dependencies.apiBaseUrl)}/api/v1/internal/content/glyphs/${encodeURIComponent(job.glyphId)}/crop-result`,
    {
      body: JSON.stringify({
        checksum,
        height,
        objectKey: job.outputObjectKey,
        width,
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": dependencies.internalToken,
        "X-Request-Id": job.glyphId,
      },
      method: "POST",
    },
  );
  if (!callback.ok) {
    throw new Error(`Glyph crop callback failed (${callback.status}).`);
  }
}
