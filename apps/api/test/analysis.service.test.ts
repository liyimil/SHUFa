import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { BadRequestException, UnauthorizedException } from "@nestjs/common";

import type { AnalysisRepository } from "../src/analysis/analysis.repository.js";
import { AnalysisService } from "../src/analysis/analysis.service.js";
import type {
  ArtworkAnalysisView,
  QualityFailureInput,
  QualityResultInput,
} from "../src/analysis/analysis.types.js";

const artwork: ArtworkAnalysisView = {
  analysis: {
    findings: [],
    metrics: null,
    status: "PROCESSING",
    thresholdVersion: null,
  },
  artworkId: "artwork-id",
  artworkStatus: "PROCESSING",
  confirmedCharacter: null,
  createdAt: "2026-07-18T00:00:00.000Z",
};

class MemoryAnalysisRepository implements AnalysisRepository {
  failure: QualityFailureInput | null = null;
  result: QualityResultInput | null = null;

  confirmCharacter(_artworkId: string, _userId: string, character: string) {
    return Promise.resolve({ character });
  }

  findOwnedArtwork() {
    return Promise.resolve(artwork);
  }

  recordFailure(_analysisId: string, input: QualityFailureInput) {
    this.failure = input;
    return Promise.resolve({
      artworkId: artwork.artworkId,
      status: "FAILED" as const,
    });
  }

  recordResult(_analysisId: string, input: QualityResultInput) {
    this.result = input;
    return Promise.resolve({
      artworkId: artwork.artworkId,
      status: "PASSED" as const,
    });
  }
}

describe("AnalysisService", () => {
  const previousToken = process.env.INTERNAL_WORKER_TOKEN;

  before(() => {
    process.env.INTERNAL_WORKER_TOKEN = "test-worker-token";
  });

  after(() => {
    if (previousToken === undefined) {
      delete process.env.INTERNAL_WORKER_TOKEN;
    } else {
      process.env.INTERNAL_WORKER_TOKEN = previousToken;
    }
  });

  it("returns only the authenticated user's artwork", async () => {
    const service = new AnalysisService(new MemoryAnalysisRepository());
    assert.deepEqual(
      await service.getArtwork("artwork-id", "user-id"),
      artwork,
    );
  });

  it("normalizes and saves a user-confirmed Han character", async () => {
    const service = new AnalysisService(new MemoryAnalysisRepository());
    assert.deepEqual(
      await service.confirmCharacter("artwork-id", "user-id", " 永 "),
      { character: "永" },
    );
    await assert.rejects(
      () => service.confirmCharacter("artwork-id", "user-id", "AB"),
      BadRequestException,
    );
  });

  it("accepts a valid worker quality result", async () => {
    const repository = new MemoryAnalysisRepository();
    const service = new AnalysisService(repository);
    const result = await service.recordWorkerResult(
      "analysis-id",
      "test-worker-token",
      {
        findings: [],
        metrics: {
          blur_score: 100,
          brightness: 220,
          contrast: 50,
          edge_ink_ratio: 0.01,
          height: 512,
          ink_coverage: 0.2,
          width: 512,
        },
        status: "PASS",
        threshold_version: "quality-v1",
      },
    );

    assert.equal(result.status, "PASSED");
    assert.equal(repository.result?.threshold_version, "quality-v1");
  });

  it("sanitizes and records a terminal worker failure", async () => {
    const repository = new MemoryAnalysisRepository();
    const service = new AnalysisService(repository);

    const result = await service.recordWorkerFailure(
      "analysis-id",
      "test-worker-token",
      {
        failureCode: "QUALITY_ANALYSIS_FAILED",
        failureMessage:
          "GET https://storage.example/users/private.jpg?token=secret failed",
      },
    );

    assert.equal(result.status, "FAILED");
    assert.deepEqual(repository.failure, {
      failureCode: "QUALITY_ANALYSIS_FAILED",
      failureMessage: "GET [redacted-url] failed",
    });
  });

  it("rejects callers without the internal worker token", async () => {
    const service = new AnalysisService(new MemoryAnalysisRepository());
    await assert.rejects(
      () => service.recordWorkerResult("analysis-id", undefined, {}),
      UnauthorizedException,
    );
    await assert.rejects(
      () => service.recordWorkerFailure("analysis-id", undefined, {}),
      UnauthorizedException,
    );
  });

  it("rejects malformed AI output", async () => {
    const service = new AnalysisService(new MemoryAnalysisRepository());
    await assert.rejects(
      () =>
        service.recordWorkerResult("analysis-id", "test-worker-token", {
          findings: [],
          metrics: {},
          status: "PASS",
          threshold_version: "quality-v1",
        }),
      BadRequestException,
    );
  });
});
