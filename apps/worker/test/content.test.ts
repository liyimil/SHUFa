import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type GlyphCropJob, processGlyphCrop } from "../src/content.js";

const job: GlyphCropJob = {
  bboxHeight: 400,
  bboxWidth: 300,
  bboxX: 20,
  bboxY: 30,
  glyphId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
  mimeType: "image/png",
  outputObjectKey:
    "content/glyphs/53a3e68c-c38c-4b79-90b4-ab1212491184/glyph.webp",
  sourceObjectKey: "content/sources/source.png",
};

describe("glyph crop worker", () => {
  it("crops privately, uploads publicly and reports metadata", async () => {
    let uploadedKey = "";
    const requestIds: Array<string | null> = [];
    let requests = 0;
    await processGlyphCrop(job, {
      aiServiceUrl: "http://ai:8000",
      apiBaseUrl: "http://api:3001",
      downloadObject: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      fetcher: async (_input, init) => {
        requests += 1;
        requestIds.push(new Headers(init?.headers).get("x-request-id"));
        if (requests === 1) {
          return new Response(new Uint8Array([4, 5, 6]), {
            headers: {
              "Content-Type": "image/webp",
              "X-Content-SHA256": "a".repeat(64),
              "X-Image-Height": "400",
              "X-Image-Width": "300",
            },
            status: 200,
          });
        }
        return new Response(JSON.stringify({ status: "NEEDS_REVIEW" }), {
          status: 200,
        });
      },
      internalToken: "worker-token",
      uploadPublicObject: (input) => {
        uploadedKey = input.objectKey;
        assert.equal(input.checksum, "a".repeat(64));
        return Promise.resolve();
      },
    });
    assert.equal(uploadedKey, job.outputObjectKey);
    assert.equal(requests, 2);
    assert.deepEqual(requestIds, [job.glyphId, job.glyphId]);
  });
});
