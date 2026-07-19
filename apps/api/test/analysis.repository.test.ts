import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaAnalysisRepository } from "../src/analysis/prisma-analysis.repository.js";
import type { PrismaService } from "../src/database/prisma.service.js";

type AnalysisState =
  "PENDING" | "PROCESSING" | "PASSED" | "NEEDS_RETAKE" | "FAILED";

function createHarness(initialStatus: AnalysisState) {
  let status = initialStatus;
  let analysisUpdates = 0;
  let artworkUpdate: Record<string, unknown> | null = null;
  const transaction = {
    artworkAnalysis: {
      findUnique: () => Promise.resolve({ artworkId: "artwork-id", status }),
      updateMany: (input: {
        data: { status: AnalysisState };
        where: { status: { in: AnalysisState[] } };
      }) => {
        if (!input.where.status.in.includes(status)) {
          return Promise.resolve({ count: 0 });
        }
        status = input.data.status;
        analysisUpdates += 1;
        return Promise.resolve({ count: 1 });
      },
    },
    userArtwork: {
      update: (input: { data: Record<string, unknown> }) => {
        artworkUpdate = input.data;
        return Promise.resolve({});
      },
      updateMany: (input: { data: Record<string, unknown> }) => {
        artworkUpdate = input.data;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    $transaction: <T>(callback: (client: typeof transaction) => Promise<T>) =>
      callback(transaction),
  } as unknown as PrismaService;
  return {
    get analysisUpdates() {
      return analysisUpdates;
    },
    get artworkUpdate() {
      return artworkUpdate;
    },
    repository: new PrismaAnalysisRepository(prisma),
  };
}

describe("PrismaAnalysisRepository terminal states", () => {
  it("marks a pending quality analysis failed while keeping manual confirmation available", async () => {
    const harness = createHarness("PENDING");

    const result = await harness.repository.recordFailure(
      "analysis-id",
      {
        failureCode: "QUALITY_ANALYSIS_FAILED",
        failureMessage: "AI timeout",
      },
      new Date("2026-07-18T00:00:00.000Z"),
    );

    assert.equal(result?.status, "FAILED");
    assert.equal(harness.analysisUpdates, 1);
    assert.deepEqual(harness.artworkUpdate, {
      failureCode: "QUALITY_ANALYSIS_FAILED",
      status: "READY",
    });
  });

  it("does not let a late failure overwrite a completed quality result", async () => {
    const harness = createHarness("PASSED");

    const result = await harness.repository.recordFailure(
      "analysis-id",
      {
        failureCode: "QUALITY_ANALYSIS_FAILED",
        failureMessage: "late timeout",
      },
      new Date("2026-07-18T00:00:00.000Z"),
    );

    assert.equal(result?.status, "PASSED");
    assert.equal(harness.analysisUpdates, 0);
    assert.equal(harness.artworkUpdate, null);
  });

  it("does not let a late result overwrite a terminal failure", async () => {
    const harness = createHarness("FAILED");

    const result = await harness.repository.recordResult(
      "analysis-id",
      {
        findings: [],
        metrics: {
          blur_score: 100,
          brightness: 220,
          contrast: 50,
          edge_ink_ratio: 0,
          height: 512,
          ink_coverage: 0.2,
          width: 512,
        },
        status: "PASS",
        threshold_version: "quality-v1",
      },
      new Date("2026-07-18T00:00:00.000Z"),
    );

    assert.equal(result?.status, "FAILED");
    assert.equal(harness.analysisUpdates, 0);
    assert.equal(harness.artworkUpdate, null);
  });
});
