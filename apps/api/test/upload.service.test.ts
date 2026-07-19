import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";

import type { ObjectStorage } from "../src/upload/object-storage.js";
import type {
  ArtworkAnalysisJob,
  ArtworkAnalysisQueue,
} from "../src/analysis/analysis.queue.js";
import type {
  PendingUploadRecord,
  UploadRepository,
} from "../src/upload/upload.repository.js";
import { UploadService } from "../src/upload/upload.service.js";
import { PrivacyService } from "../src/privacy/privacy.service.js";

const userId = "3fe537fd-6601-43f0-a31d-781bd5bde945";
const artworkId = "53a3e68c-c38c-4b79-90b4-ab1212491184";
const uploadId = "ebbc505b-7df5-4ce7-8f3a-33dc07c4a957";
const now = new Date("2026-07-18T00:00:00.000Z");
const clientRequestId = "mobile-request-0001";

const allowingPrivacyService = new PrivacyService({
  getPreferences: () =>
    Promise.resolve({
      allowArtworkStorage: true,
      allowModelTraining: false,
      allowPublicSharing: true,
      policyVersion: "privacy-v1",
      sharingUpdatedAt: now,
      storageUpdatedAt: now,
      trainingUpdatedAt: now,
      updatedAt: now,
    }),
  updatePreferences: () => Promise.reject(new Error("not used")),
});

class MemoryUploadRepository implements UploadRepository {
  record: PendingUploadRecord | null = null;

  claimPendingUploadCancellation() {
    if (
      !this.record ||
      !["PENDING_UPLOAD", "DELETION_PENDING"].includes(this.record.status)
    ) {
      return Promise.resolve(null);
    }
    this.record.status = "DELETION_PENDING";
    return Promise.resolve({
      artworkId: this.record.artworkId,
      objectKey: this.record.objectKey,
    });
  }

  finishPendingUploadCancellation() {
    if (!this.record || this.record.status !== "DELETION_PENDING") {
      return Promise.resolve(false);
    }
    this.record.status = "DELETED";
    return Promise.resolve(true);
  }

  createPendingUpload(input: {
    clientRequestId: string;
    expiresAt: Date;
    height: number;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    objectKey: string;
    sizeBytes: number;
    width: number;
  }) {
    this.record = {
      artworkId,
      expiresAt: input.expiresAt,
      height: input.height,
      mimeType: input.mimeType,
      objectKey: input.objectKey,
      sizeBytes: input.sizeBytes,
      status: "PENDING_UPLOAD",
      uploadId,
      width: input.width,
    };
    return Promise.resolve({
      artworkId,
      expiresAt: input.expiresAt,
      mimeType: input.mimeType,
      objectKey: input.objectKey,
      uploadId,
    });
  }

  findOwnedUpload() {
    return Promise.resolve(this.record);
  }

  markUploaded() {
    if (
      !this.record ||
      !["PENDING_UPLOAD", "PROCESSING", "READY", "FAILED"].includes(
        this.record.status,
      )
    ) {
      return Promise.resolve(null);
    }
    if (this.record) {
      this.record.status = "PROCESSING";
    }
    return Promise.resolve({
      analysisId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
      artworkId,
      mimeType: this.record?.mimeType ?? "image/jpeg",
      objectKey: this.record?.objectKey ?? "missing",
    });
  }
}

class MemoryAnalysisQueue implements ArtworkAnalysisQueue {
  job: ArtworkAnalysisJob | null = null;

  enqueue(job: ArtworkAnalysisJob) {
    this.job = job;
    return Promise.resolve();
  }
}

class MemoryObjectStorage implements ObjectStorage {
  bytes = new Uint8Array();
  metadata: {
    checksumSha256: string | null;
    contentLength: number;
    contentType: string | null;
  } | null = null;
  deletedPrivateKeys: string[] = [];

  createUploadUrl() {
    return Promise.resolve("https://storage.example/upload");
  }

  createDownloadUrl() {
    return Promise.resolve("https://storage.example/download");
  }

  deletePrivateObject(objectKey: string) {
    this.deletedPrivateKeys.push(objectKey);
    return Promise.resolve();
  }

  deletePublicObject() {
    return Promise.resolve();
  }

  headPrivateObject() {
    return Promise.resolve(this.metadata);
  }

  readPrivateObject() {
    return Promise.resolve(this.bytes);
  }
}

describe("UploadService", () => {
  it("creates a bounded private upload session", async () => {
    const repository = new MemoryUploadRepository();
    const service = new UploadService(
      repository,
      new MemoryObjectStorage(),
      new MemoryAnalysisQueue(),
      allowingPrivacyService,
    );

    const result = await service.createUpload(
      userId,
      {
        clientRequestId,
        height: 1024,
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        width: 1024,
      },
      now,
    );

    assert.equal(result.artworkId, artworkId);
    assert.equal(result.uploadId, uploadId);
    assert.equal(result.requiredHeaders["content-type"], "image/jpeg");
    assert.equal(result.expiresAt, "2026-07-18T00:10:00.000Z");
    assert.match(
      repository.record?.objectKey ?? "",
      new RegExp(`^users/${userId}/artworks/`),
    );
  });

  it("rejects images larger than 10 MB", async () => {
    const service = new UploadService(
      new MemoryUploadRepository(),
      new MemoryObjectStorage(),
      new MemoryAnalysisQueue(),
      allowingPrivacyService,
    );

    await assert.rejects(
      () =>
        service.createUpload(userId, {
          clientRequestId,
          height: 1024,
          mimeType: "image/jpeg",
          sizeBytes: 11 * 1024 * 1024,
          width: 1024,
        }),
      BadRequestException,
    );
  });

  it("does not create an upload after storage permission is withdrawn", async () => {
    const deniedPrivacy = new PrivacyService({
      getPreferences: () =>
        Promise.resolve({
          allowArtworkStorage: false,
          allowModelTraining: false,
          allowPublicSharing: false,
          policyVersion: "privacy-v1",
          sharingUpdatedAt: now,
          storageUpdatedAt: now,
          trainingUpdatedAt: now,
          updatedAt: now,
        }),
      updatePreferences: () => Promise.reject(new Error("not used")),
    });
    const service = new UploadService(
      new MemoryUploadRepository(),
      new MemoryObjectStorage(),
      new MemoryAnalysisQueue(),
      deniedPrivacy,
    );

    await assert.rejects(() =>
      service.createUpload(userId, {
        clientRequestId,
        height: 1024,
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        width: 1024,
      }),
    );
  });

  it("verifies stored size and type before completion", async () => {
    const repository = new MemoryUploadRepository();
    const storage = new MemoryObjectStorage();
    const queue = new MemoryAnalysisQueue();
    const service = new UploadService(
      repository,
      storage,
      queue,
      allowingPrivacyService,
    );
    storage.bytes = Uint8Array.from(
      await sharp({
        create: {
          background: "white",
          channels: 3,
          height: 256,
          width: 256,
        },
      })
        .png()
        .toBuffer(),
    );

    await service.createUpload(
      userId,
      {
        clientRequestId,
        height: 256,
        mimeType: "image/png",
        sizeBytes: storage.bytes.byteLength,
        width: 256,
      },
      now,
    );
    storage.metadata = {
      checksumSha256: null,
      contentLength: storage.bytes.byteLength,
      contentType: "image/png",
    };

    const result = await service.completeUpload(
      uploadId,
      userId,
      new Date("2026-07-18T00:01:00.000Z"),
    );

    assert.equal(result.status, "PROCESSING");
    assert.equal(result.artworkId, artworkId);
    assert.equal(queue.job?.artworkId, artworkId);
  });

  it("does not complete when the uploaded size differs", async () => {
    const repository = new MemoryUploadRepository();
    const storage = new MemoryObjectStorage();
    const service = new UploadService(
      repository,
      storage,
      new MemoryAnalysisQueue(),
      allowingPrivacyService,
    );

    await service.createUpload(
      userId,
      {
        clientRequestId,
        height: 1024,
        mimeType: "image/png",
        sizeBytes: 4096,
        width: 1024,
      },
      now,
    );
    storage.metadata = {
      checksumSha256: null,
      contentLength: 1,
      contentType: "image/png",
    };

    await assert.rejects(
      () =>
        service.completeUpload(
          uploadId,
          userId,
          new Date("2026-07-18T00:01:00.000Z"),
        ),
      BadRequestException,
    );
  });

  it("deletes a malformed image instead of queueing analysis", async () => {
    const repository = new MemoryUploadRepository();
    const storage = new MemoryObjectStorage();
    const queue = new MemoryAnalysisQueue();
    const service = new UploadService(
      repository,
      storage,
      queue,
      allowingPrivacyService,
    );
    storage.bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]);
    await service.createUpload(
      userId,
      {
        clientRequestId,
        height: 256,
        mimeType: "image/jpeg",
        sizeBytes: storage.bytes.byteLength,
        width: 256,
      },
      now,
    );
    storage.metadata = {
      checksumSha256: null,
      contentLength: storage.bytes.byteLength,
      contentType: "image/jpeg",
    };

    await assert.rejects(
      () => service.completeUpload(uploadId, userId, now),
      (error: unknown) =>
        error instanceof BadRequestException &&
        (error.getResponse() as { code?: string }).code ===
          "UPLOAD_CONTENT_INVALID",
    );

    assert.equal(repository.record?.status, "DELETED");
    assert.deepEqual(storage.deletedPrivateKeys, [
      repository.record?.objectKey,
    ]);
    assert.equal(queue.job, null);
  });

  it("rejects declared images above the decoded pixel budget", async () => {
    const service = new UploadService(
      new MemoryUploadRepository(),
      new MemoryObjectStorage(),
      new MemoryAnalysisQueue(),
      allowingPrivacyService,
    );

    await assert.rejects(
      () =>
        service.createUpload(userId, {
          clientRequestId,
          height: 4_000,
          mimeType: "image/jpeg",
          sizeBytes: 2_048,
          width: 12_000,
        }),
      BadRequestException,
    );
  });

  it("cancels a pending upload and keeps a lost-response retry idempotent", async () => {
    const repository = new MemoryUploadRepository();
    const storage = new MemoryObjectStorage();
    const queue = new MemoryAnalysisQueue();
    const service = new UploadService(
      repository,
      storage,
      queue,
      allowingPrivacyService,
    );
    await service.createUpload(
      userId,
      {
        clientRequestId,
        height: 1024,
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        width: 1024,
      },
      now,
    );

    const result = await service.cancelUpload(uploadId, userId);
    const retried = await service.cancelUpload(uploadId, userId);

    assert.equal(result.status, "DELETED");
    assert.deepEqual(retried, result);
    assert.equal(repository.record?.status, "DELETED");
    assert.deepEqual(storage.deletedPrivateKeys, [
      repository.record?.objectKey,
    ]);
    assert.equal(queue.job, null);
  });

  it("does not complete an upload after cancellation claimed the state", async () => {
    const repository = new MemoryUploadRepository();
    const storage = new MemoryObjectStorage();
    const service = new UploadService(
      repository,
      storage,
      new MemoryAnalysisQueue(),
      allowingPrivacyService,
    );
    await service.createUpload(
      userId,
      {
        clientRequestId,
        height: 1024,
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        width: 1024,
      },
      now,
    );
    await repository.claimPendingUploadCancellation();

    await assert.rejects(
      () => service.completeUpload(uploadId, userId, now),
      BadRequestException,
    );
  });
});
