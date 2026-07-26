import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type SourceSegmentationJob,
  processSourceSegmentation,
  reportSourceSegmentationFailure,
} from "../src/segmentation.js";

const job: SourceSegmentationJob = {
  jobId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
  mimeType: "image/png",
  sourceObjectKey: "content/sources/source.png",
};

describe("source segmentation worker", () => {
  it("marks processing, calls AI and persists versioned candidates", async () => {
    const requests: Array<{
      body: string;
      requestId: string | null;
      url: string;
    }> = [];
    await processSourceSegmentation(job, {
      aiServiceUrl: "http://ai:8000",
      apiBaseUrl: "http://api:3001",
      downloadObject: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      fetcher: async (input, init) => {
        const url = String(input);
        requests.push({
          body: typeof init?.body === "string" ? init.body : "",
          requestId: new Headers(init?.headers).get("x-request-id"),
          url,
        });
        if (url.endsWith("/v1/source-segmentation")) {
          return Response.json({
            algorithmVersion: "opencv-dilate-contours-v1",
            candidates: [
              {
                bboxHeight: 120,
                bboxWidth: 100,
                bboxX: 20,
                bboxY: 30,
                confidence: 800,
              },
            ],
          });
        }
        return Response.json({ status: "ok" });
      },
      internalToken: "worker-token",
    });
    assert.equal(requests.length, 3);
    assert.deepEqual(
      requests.map((request) => request.requestId),
      [job.jobId, job.jobId, job.jobId],
    );
    assert.match(requests[0]?.url ?? "", /\/started$/);
    assert.match(requests[1]?.url ?? "", /\/v1\/source-segmentation$/);
    assert.match(requests[2]?.body ?? "", /opencv-dilate-contours-v1/);
  });

  it("reports a bounded terminal failure", async () => {
    let requestBody = "";
    await reportSourceSegmentationFailure(
      job,
      {
        aiServiceUrl: "http://ai:8000",
        apiBaseUrl: "http://api:3001",
        downloadObject: () => Promise.resolve(new Uint8Array()),
        fetcher: async (_input, init) => {
          requestBody = String(init?.body ?? "");
          assert.equal(
            new Headers(init?.headers).get("x-request-id"),
            job.jobId,
          );
          return Response.json({ status: "FAILED" });
        },
        internalToken: "worker-token",
      },
      new Error("AI unavailable"),
    );
    assert.deepEqual(JSON.parse(requestBody), {
      failureCode: "SEGMENTATION_WORKER_FAILED",
      failureMessage: "AI unavailable",
    });
  });
});
