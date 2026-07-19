import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaPracticeRepository } from "../src/practice/prisma-practice.repository.js";

const provenance = {
  masterChecksumSha256: "a".repeat(64),
  masterObjectKey: "content/glyphs/master.webp",
  measurementVersion: "structure-measurement-v2",
  modelVersion: "no-ml-geometry-v1",
  normalizationVersion: "glyph-normalization-v1",
  ruleVersion: "structure-v1",
  userChecksumSha256: "b".repeat(64),
  userObjectKey: "users/test/artwork.jpg",
};

describe("PrismaPracticeRepository analysis provenance", () => {
  it("requires a passed quality analysis before creating a practice", async () => {
    let artworkWhere: Record<string, unknown> | null = null;
    const repository = new PrismaPracticeRepository({
      userArtwork: {
        findFirst: (input: { where: Record<string, unknown> }) => {
          artworkWhere = input.where;
          return Promise.resolve(null);
        },
      },
    } as never);

    assert.equal(
      await repository.createPractice("user-id", "artwork-id", "glyph-id"),
      null,
    );
    assert.deepEqual(
      (artworkWhere as { analysis?: unknown } | null)?.analysis,
      { status: "PASSED" },
    );
  });

  it("requires a passed quality analysis before adding another attempt", async () => {
    let artworkWhere: Record<string, unknown> | null = null;
    const repository = new PrismaPracticeRepository({
      practiceSession: {
        findFirst: () =>
          Promise.resolve({
            _count: { attempts: 1 },
            characterId: "character-id",
          }),
      },
      userArtwork: {
        findFirst: (input: { where: Record<string, unknown> }) => {
          artworkWhere = input.where;
          return Promise.resolve(null);
        },
      },
    } as never);

    assert.equal(
      await repository.addAttempt("user-id", "session-id", "artwork-id"),
      null,
    );
    assert.deepEqual(
      (artworkWhere as { analysis?: unknown } | null)?.analysis,
      { status: "PASSED" },
    );
  });

  it("does not reset an already pending analysis during polling", async () => {
    let updateCalls = 0;
    const prisma = {
      practiceAnalysisRun: {
        createMany: () => Promise.resolve({ count: 0 }),
        findUnique: () =>
          Promise.resolve({
            masterObjectKey: provenance.masterObjectKey,
            status: "PENDING",
            userObjectKey: provenance.userObjectKey,
          }),
        update: () => {
          updateCalls += 1;
          return Promise.resolve({});
        },
      },
    };
    const repository = new PrismaPracticeRepository(prisma as never);
    await repository.prepareAnalysisRun({
      attemptId: "attempt-id",
      masterObjectKey: provenance.masterObjectKey,
      userObjectKey: provenance.userObjectKey,
    });
    assert.equal(updateCalls, 0);
  });

  it("does not reset a terminal failure during polling", async () => {
    let updateCalls = 0;
    const prisma = {
      practiceAnalysisRun: {
        createMany: () => Promise.resolve({ count: 0 }),
        findUnique: () =>
          Promise.resolve({
            masterObjectKey: provenance.masterObjectKey,
            status: "FAILED",
            userObjectKey: provenance.userObjectKey,
          }),
        update: () => {
          updateCalls += 1;
          return Promise.resolve({});
        },
      },
    };
    const repository = new PrismaPracticeRepository(prisma as never);

    await repository.prepareAnalysisRun({
      attemptId: "attempt-id",
      masterObjectKey: provenance.masterObjectKey,
      userObjectKey: provenance.userObjectKey,
    });

    assert.equal(updateCalls, 0);
  });

  it("atomically saves advice with asset hashes and every algorithm version", async () => {
    let adviceSnapshot: unknown = null;
    let analysisData: Record<string, unknown> | null = null;
    const transaction = {
      practiceAnalysisRun: {
        findUnique: () =>
          Promise.resolve({
            masterObjectKey: provenance.masterObjectKey,
            status: "PENDING",
            userObjectKey: provenance.userObjectKey,
          }),
        update: (input: { data: Record<string, unknown> }) => {
          analysisData = input.data;
          return Promise.resolve({});
        },
      },
      practiceAttempt: {
        updateMany: (input: { data: { adviceSnapshot: unknown } }) => {
          adviceSnapshot = input.data.adviceSnapshot;
          return Promise.resolve({ count: 1 });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaPracticeRepository(prisma as never);
    const result = await repository.recordAdvice(
      "attempt-id",
      { measurement_version: "structure-measurement-v2" },
      provenance,
      new Date("2026-07-18T12:00:00.000Z"),
    );

    assert.equal(result, true);
    assert.deepEqual(adviceSnapshot, {
      measurement_version: "structure-measurement-v2",
    });
    assert.equal(
      (analysisData as { userChecksumSha256?: string } | null)
        ?.userChecksumSha256,
      "b".repeat(64),
    );
    assert.equal(
      (analysisData as { normalizationVersion?: string } | null)
        ?.normalizationVersion,
      "glyph-normalization-v1",
    );
    assert.equal((analysisData as { status?: string } | null)?.status, "READY");
  });

  it("refuses a callback whose asset keys do not match the queued run", async () => {
    let writes = 0;
    const transaction = {
      practiceAnalysisRun: {
        findUnique: () =>
          Promise.resolve({
            masterObjectKey: "content/glyphs/other.webp",
            status: "PENDING",
            userObjectKey: provenance.userObjectKey,
          }),
      },
      practiceAttempt: {
        updateMany: () => {
          writes += 1;
          return Promise.resolve({ count: 1 });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaPracticeRepository(prisma as never);
    const result = await repository.recordAdvice(
      "attempt-id",
      {},
      provenance,
      new Date("2026-07-18T12:00:00.000Z"),
    );

    assert.equal(result, false);
    assert.equal(writes, 0);
  });

  it("accepts an identical retry without overwriting a ready result", async () => {
    let writes = 0;
    const transaction = {
      practiceAnalysisRun: {
        findUnique: () =>
          Promise.resolve({
            ...provenance,
            status: "READY",
          }),
      },
      practiceAttempt: {
        updateMany: () => {
          writes += 1;
          return Promise.resolve({ count: 1 });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaPracticeRepository(prisma as never);
    const result = await repository.recordAdvice(
      "attempt-id",
      {},
      provenance,
      new Date("2026-07-18T12:00:00.000Z"),
    );

    assert.equal(result, true);
    assert.equal(writes, 0);
  });
});
