import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  processPracticeAnalysis,
  reportPracticeAnalysisFailure,
} from "../src/practice.js";

describe("practice structure worker", () => {
  it("compares user and master images then reports explainable advice", async () => {
    let requests = 0;
    await processPracticeAnalysis(
      {
        attemptId: "ebbc505b-7df5-4ce7-8f3a-33dc07c4a957",
        masterObjectKey: "content/glyphs/master.webp",
        userMimeType: "image/jpeg",
        userObjectKey: "users/test/artwork.jpg",
      },
      {
        aiServiceUrl: "http://ai:8000",
        apiBaseUrl: "http://api:3001",
        downloadMaster: () => Promise.resolve(new Uint8Array([1, 2, 3])),
        downloadUser: () => Promise.resolve(new Uint8Array([4, 5, 6])),
        fetcher: async (_input, init) => {
          requests += 1;
          if (requests === 1) {
            assert.ok(init?.body instanceof FormData);
            return new Response(
              JSON.stringify({
                master: {},
                measurement_version: "structure-measurement-v2",
                model_version: "no-ml-geometry-v1",
                normalization_version: "glyph-normalization-v1",
                suggestions: [],
                threshold_version: "structure-v1",
                user: {},
              }),
              { headers: { "Content-Type": "application/json" }, status: 200 },
            );
          }
          assert.equal(
            new Headers(init?.headers).get("x-internal-token"),
            "worker-token",
          );
          const callback = JSON.parse(String(init?.body)) as {
            provenance: Record<string, string>;
            result: Record<string, unknown>;
          };
          assert.equal(
            callback.provenance.userObjectKey,
            "users/test/artwork.jpg",
          );
          assert.match(
            callback.provenance.userChecksumSha256 ?? "",
            /^[a-f0-9]{64}$/,
          );
          assert.equal(
            callback.result.measurement_version,
            "structure-measurement-v2",
          );
          return new Response("{}", { status: 200 });
        },
        internalToken: "worker-token",
      },
    );
    assert.equal(requests, 2);
  });

  it("reports a bounded terminal failure with the expected assets", async () => {
    let callbackBody: Record<string, unknown> | null = null;
    await reportPracticeAnalysisFailure(
      {
        attemptId: "ebbc505b-7df5-4ce7-8f3a-33dc07c4a957",
        masterObjectKey: "content/glyphs/master.webp",
        userMimeType: "image/jpeg",
        userObjectKey: "users/test/artwork.jpg",
      },
      {
        apiBaseUrl: "http://api:3001",
        fetcher: async (_input, init) => {
          callbackBody = JSON.parse(String(init?.body));
          return new Response("{}", { status: 201 });
        },
        internalToken: "worker-token",
      },
      new Error("download failed"),
    );

    assert.deepEqual(callbackBody, {
      failureCode: "STRUCTURE_ANALYSIS_FAILED",
      failureMessage: "download failed",
      masterObjectKey: "content/glyphs/master.webp",
      userObjectKey: "users/test/artwork.jpg",
    });
  });
});
