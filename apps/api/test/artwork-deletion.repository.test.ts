import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaPracticeRepository } from "../src/practice/prisma-practice.repository.js";

const artworkId = "d450b9ee-0b7c-4b8f-b9c6-377dcd2bc1bb";
const deletionId = "73028998-55d5-4d02-856d-302c8683889a";
const now = new Date("2026-07-18T12:00:00.000Z");
const objectKey = "users/test/artworks/practice/original.jpg";

describe("PrismaPracticeRepository artwork deletion", () => {
  it("atomically revokes access, clears derived analysis and creates a deletion task", async () => {
    let revokedShares = 0;
    let artworkStatus: string | null = null;
    let clearedAdvice = 0;
    const transaction = {
      adviceReview: { deleteMany: () => Promise.resolve({ count: 1 }) },
      artworkAnalysis: { deleteMany: () => Promise.resolve({ count: 1 }) },
      artworkDeletionTask: {
        create: () =>
          Promise.resolve({
            attemptNumber: 1,
            id: deletionId,
            objectKey,
            updatedAt: now,
          }),
      },
      practiceAnalysisRun: {
        deleteMany: () => Promise.resolve({ count: 1 }),
      },
      practiceAttempt: {
        updateMany: () => {
          clearedAdvice += 1;
          return Promise.resolve({ count: 1 });
        },
      },
      shareLink: {
        updateMany: () => {
          revokedShares += 1;
          return Promise.resolve({ count: 1 });
        },
      },
      userArtwork: {
        findFirst: () =>
          Promise.resolve({
            deletionTask: null,
            originalObjectKey: objectKey,
            status: "READY",
          }),
        update: (input: { data: { status: string } }) => {
          artworkStatus = input.data.status;
          return Promise.resolve({});
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaPracticeRepository(prisma as never);

    const result = await repository.requestArtworkDeletion(
      "user-id",
      artworkId,
      now,
    );

    assert.equal(result?.status, "PENDING");
    assert.equal(result?.deletionId, deletionId);
    assert.equal(artworkStatus, "DELETION_PENDING");
    assert.equal(revokedShares, 1);
    assert.equal(clearedAdvice, 1);
  });

  it("requeues a failed task with a new attempt without repeating logical deletion", async () => {
    const transaction = {
      artworkDeletionTask: {
        updateMany: () => Promise.resolve({ count: 1 }),
      },
      userArtwork: {
        findFirst: () =>
          Promise.resolve({
            deletionTask: {
              attemptNumber: 2,
              id: deletionId,
              objectKey,
              status: "FAILED",
              updatedAt: now,
            },
            originalObjectKey: objectKey,
            status: "DELETION_PENDING",
          }),
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaPracticeRepository(prisma as never);

    const result = await repository.requestArtworkDeletion(
      "user-id",
      artworkId,
      now,
    );

    assert.equal(result?.attemptNumber, 3);
    assert.equal(result?.status, "PENDING");
  });

  it("marks the database row deleted only after the matching worker callback", async () => {
    let artworkStatus: string | null = null;
    const transaction = {
      artworkDeletionTask: {
        findUnique: () =>
          Promise.resolve({
            artwork: { status: "DELETION_PENDING" },
            artworkId,
            attemptNumber: 3,
            objectKey,
            status: "COMPLETED",
          }),
        updateMany: () => Promise.resolve({ count: 1 }),
      },
      userArtwork: {
        updateMany: (input: { data: { status: string } }) => {
          artworkStatus = input.data.status;
          return Promise.resolve({ count: 1 });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaPracticeRepository(prisma as never);

    const completed = await repository.completeArtworkDeletion({
      attemptNumber: 3,
      deletionId,
      now,
      objectKey,
    });

    assert.equal(completed, true);
    assert.equal(artworkStatus, "DELETED");
  });

  it("ignores a stale failure callback from an older retry", async () => {
    const prisma = {
      artworkDeletionTask: {
        updateMany: () => Promise.resolve({ count: 0 }),
      },
    };
    const repository = new PrismaPracticeRepository(prisma as never);

    const failed = await repository.failArtworkDeletion({
      attemptNumber: 1,
      deletionId,
      failureCode: "ARTWORK_PHYSICAL_DELETION_FAILED",
      failureMessage: "timeout",
      now,
      objectKey,
    });

    assert.equal(failed, false);
  });
});
