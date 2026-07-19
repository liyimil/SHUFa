import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaUploadRepository } from "../src/upload/prisma-upload.repository.js";

describe("PrismaUploadRepository state claims", () => {
  it("reuses the same pending session for an identical client request", async () => {
    const prisma = {
      $transaction: () => Promise.reject(new Error("must not create twice")),
      uploadSession: {
        findUnique: () =>
          Promise.resolve({
            artwork: {
              height: 1024,
              id: "artwork-id",
              mimeType: "image/jpeg",
              sizeBytes: 2048,
              status: "PENDING_UPLOAD",
              userId: "user-id",
              width: 1024,
            },
            expiresAt: new Date("2026-07-18T00:10:00.000Z"),
            id: "upload-id",
            objectKey: "users/user-id/artworks/id/original.jpg",
          }),
      },
    };
    const repository = new PrismaUploadRepository(prisma as never);
    const result = await repository.createPendingUpload({
      clientRequestId: "mobile-request-0001",
      expiresAt: new Date("2026-07-18T00:11:00.000Z"),
      height: 1024,
      mimeType: "image/jpeg",
      objectKey: "users/user-id/artworks/new/original.jpg",
      sizeBytes: 2048,
      userId: "user-id",
      width: 1024,
    });

    assert.deepEqual(result, {
      artworkId: "artwork-id",
      expiresAt: new Date("2026-07-18T00:10:00.000Z"),
      mimeType: "image/jpeg",
      objectKey: "users/user-id/artworks/id/original.jpg",
      uploadId: "upload-id",
    });
  });

  it("rejects a reused client request id with changed file metadata", async () => {
    const prisma = {
      uploadSession: {
        findUnique: () =>
          Promise.resolve({
            artwork: {
              height: 1024,
              id: "artwork-id",
              mimeType: "image/jpeg",
              sizeBytes: 2048,
              status: "PENDING_UPLOAD",
              userId: "user-id",
              width: 1024,
            },
            expiresAt: new Date("2026-07-18T00:10:00.000Z"),
            id: "upload-id",
            objectKey: "users/user-id/artworks/id/original.jpg",
          }),
      },
    };
    const repository = new PrismaUploadRepository(prisma as never);
    const result = await repository.createPendingUpload({
      clientRequestId: "mobile-request-0001",
      expiresAt: new Date("2026-07-18T00:11:00.000Z"),
      height: 1024,
      mimeType: "image/png",
      objectKey: "users/user-id/artworks/new/original.png",
      sizeBytes: 2048,
      userId: "user-id",
      width: 1024,
    });

    assert.equal(result, null);
  });

  it("claims cancellation only from PENDING_UPLOAD", async () => {
    let updateInput: Record<string, unknown> | null = null;
    const transaction = {
      uploadSession: {
        findFirst: () =>
          Promise.resolve({
            artwork: { id: "artwork-id", status: "PENDING_UPLOAD" },
            objectKey: "users/user-id/artworks/id/original.jpg",
          }),
      },
      userArtwork: {
        updateMany: (input: Record<string, unknown>) => {
          updateInput = input;
          return Promise.resolve({ count: 1 });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaUploadRepository(prisma as never);
    const result = await repository.claimPendingUploadCancellation(
      "upload-id",
      "user-id",
    );

    assert.equal(result?.artworkId, "artwork-id");
    assert.deepEqual(updateInput, {
      data: { status: "DELETION_PENDING" },
      where: {
        id: "artwork-id",
        status: "PENDING_UPLOAD",
        userId: "user-id",
      },
    });
  });

  it("keeps a completed upload retry idempotent without reclaiming state", async () => {
    let stateClaimCount = 0;
    const transaction = {
      artworkAnalysis: {
        upsert: () => Promise.resolve({ id: "analysis-id" }),
      },
      uploadSession: {
        findFirst: () =>
          Promise.resolve({
            artwork: { status: "PROCESSING" },
            artworkId: "artwork-id",
            completedAt: new Date("2026-07-18T00:01:00.000Z"),
          }),
        update: () => Promise.reject(new Error("must not rewrite completion")),
      },
      userArtwork: {
        findUniqueOrThrow: () =>
          Promise.resolve({
            mimeType: "image/jpeg",
            originalObjectKey: "users/user-id/artworks/id/original.jpg",
          }),
        updateMany: () => {
          stateClaimCount += 1;
          return Promise.resolve({ count: 0 });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaUploadRepository(prisma as never);
    const result = await repository.markUploaded(
      "upload-id",
      "user-id",
      new Date("2026-07-18T00:02:00.000Z"),
    );

    assert.equal(stateClaimCount, 0);
    assert.deepEqual(result, {
      analysisId: "analysis-id",
      artworkId: "artwork-id",
      mimeType: "image/jpeg",
      objectKey: "users/user-id/artworks/id/original.jpg",
    });
  });
});
