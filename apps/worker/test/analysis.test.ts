import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ArtworkAnalysisJob,
  processArtworkAnalysis,
  reportArtworkAnalysisFailure,
} from "../src/analysis.js";

const job: ArtworkAnalysisJob = {
  analysisId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
  artworkId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
  mimeType: "image/png",
  objectKey: "users/test/artworks/test/original.png",
};

describe("artwork analysis worker", () => {
  it("downloads, analyzes and reports a quality result", async () => {
    const requestedUrls: string[] = [];
    let callbackToken: string | null = null;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/v1/image-quality")) {
        assert.ok(init?.body instanceof FormData);
        return new Response(
          JSON.stringify({
            findings: [],
            metrics: {
              blur_score: 120,
              brightness: 220,
              contrast: 70,
              edge_ink_ratio: 0,
              height: 512,
              ink_coverage: 0.2,
              width: 512,
            },
            status: "PASS",
            threshold_version: "quality-v1",
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }
      callbackToken = new Headers(init?.headers).get("x-internal-token");
      return new Response(JSON.stringify({ status: "PASSED" }), {
        status: 200,
      });
    };

    await processArtworkAnalysis(job, {
      aiServiceUrl: "http://ai:8000/",
      apiBaseUrl: "http://api:3001/",
      downloadObject: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      fetcher,
      internalToken: "test-internal-token",
    });

    assert.deepEqual(requestedUrls, [
      "http://ai:8000/v1/image-quality",
      `http://api:3001/api/v1/internal/analyses/${job.analysisId}/result`,
    ]);
    assert.equal(callbackToken, "test-internal-token");
  });

  it("does not report a result when AI analysis fails", async () => {
    let requests = 0;
    await assert.rejects(
      () =>
        processArtworkAnalysis(job, {
          aiServiceUrl: "http://ai:8000",
          apiBaseUrl: "http://api:3001",
          downloadObject: () => Promise.resolve(new Uint8Array([1, 2, 3])),
          fetcher: async () => {
            requests += 1;
            return new Response("unavailable", { status: 503 });
          },
          internalToken: "test-internal-token",
        }),
      /AI quality analysis failed/,
    );
    assert.equal(requests, 1);
  });

  it("reports a sanitized terminal failure to the API", async () => {
    let callbackBody: Record<string, unknown> | null = null;
    let callbackToken: string | null = null;
    await reportArtworkAnalysisFailure(
      job,
      {
        apiBaseUrl: "http://api:3001/",
        fetcher: async (_input, init) => {
          callbackBody = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          callbackToken = new Headers(init?.headers).get("x-internal-token");
          return new Response(null, { status: 200 });
        },
        internalToken: "test-internal-token",
      },
      new Error(
        "GET https://storage.example/users/private/original.jpg?token=secret failed",
      ),
    );

    assert.equal(callbackToken, "test-internal-token");
    assert.deepEqual(callbackBody, {
      failureCode: "QUALITY_ANALYSIS_FAILED",
      failureMessage: "GET [redacted-url] failed",
    });
  });
});
