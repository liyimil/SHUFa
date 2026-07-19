import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ObjectStorage } from "../src/upload/object-storage.js";
import type { PracticeRepository } from "../src/practice/practice.repository.js";
import { PracticeService } from "../src/practice/practice.service.js";
import type { PracticeRecord } from "../src/practice/practice.types.js";
import type {
  ArtworkDeletionJob,
  ArtworkDeletionQueue,
} from "../src/practice/artwork-deletion.queue.js";
import type {
  PracticeAnalysisJob,
  PracticeAnalysisQueue,
} from "../src/practice/practice-analysis.queue.js";
import { PrivacyService } from "../src/privacy/privacy.service.js";

const sessionId = "53a3e68c-c38c-4b79-90b4-ab1212491184";
const artworkId = "4b02e7dd-24de-47e3-ab13-1d4a7f952935";
const glyphId = "3fe537fd-6601-43f0-a31d-781bd5bde945";
const now = new Date("2026-07-18T00:00:00.000Z");

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

const record: PracticeRecord = {
  attempts: [
    {
      advice: null,
      analysis: null,
      attemptId: "ebbc505b-7df5-4ce7-8f3a-33dc07c4a957",
      artworkId,
      createdAt: new Date("2026-07-18T00:00:00.000Z"),
      objectKey: "users/test/artwork.jpg",
      mimeType: "image/jpeg",
      sequence: 1,
    },
  ],
  character: "永",
  createdAt: new Date("2026-07-18T00:00:00.000Z"),
  id: sessionId,
  master: {
    calligrapherName: "欧阳询",
    glyphId,
    imageObjectKey: "content/glyphs/master.webp",
    workTitle: "九成宫醴泉铭",
  },
};

class MemoryPracticeRepository implements PracticeRepository {
  analysisFailureMessage: string | null = null;
  deletionStatus: "PENDING" | "COMPLETED" | "FAILED" = "PENDING";
  favoriteGroupId: string | null | undefined = "not-called";
  favoriteGroupName: string | null = null;
  favoriteReorderDirection: "UP" | "DOWN" | null = null;
  shareHash: string | null = null;

  addAttempt() {
    return Promise.resolve(record);
  }
  createFavorite(
    _userId: string,
    _glyphId: string,
    groupId: string | null | undefined,
  ) {
    this.favoriteGroupId = groupId;
    return Promise.resolve(true);
  }
  createFavoriteGroup(_userId: string, name: string) {
    this.favoriteGroupName = name;
    return Promise.resolve({ id: glyphId, name, sortOrder: 0 });
  }
  createPractice() {
    return Promise.resolve(record);
  }
  createShare(_userId: string, _sessionId: string, tokenHash: string) {
    this.shareHash = tokenHash;
    return Promise.resolve({ id: "ebbc505b-7df5-4ce7-8f3a-33dc07c4a957" });
  }
  completeArtworkDeletion() {
    this.deletionStatus = "COMPLETED";
    return Promise.resolve(true);
  }
  failArtworkDeletion() {
    this.deletionStatus = "FAILED";
    return Promise.resolve(true);
  }
  findOwnedArtworkDeletion() {
    return Promise.resolve({
      artworkId,
      deletionId: "05f957fa-1938-47d7-8f15-fcd82bcf21e7",
      status:
        this.deletionStatus === "COMPLETED"
          ? ("DELETED" as const)
          : this.deletionStatus === "FAILED"
            ? ("FAILED" as const)
            : ("DELETION_PENDING" as const),
      updatedAt: now.toISOString(),
    });
  }
  findOwnedPractice() {
    return Promise.resolve(record);
  }
  findPublicShare() {
    return Promise.resolve(record);
  }
  listPractices() {
    return Promise.resolve([record]);
  }
  listFavorites() {
    return Promise.resolve({ groups: [], ungrouped: [] });
  }
  removeFavorite() {
    return Promise.resolve();
  }
  removeFavoriteGroup() {
    return Promise.resolve(true);
  }
  reorderFavorite(_userId: string, _glyphId: string, direction: "UP" | "DOWN") {
    this.favoriteReorderDirection = direction;
    return Promise.resolve(true);
  }
  reorderFavoriteGroup() {
    return Promise.resolve(true);
  }
  revokeShare() {
    return Promise.resolve(true);
  }
  updateFavoriteGroup() {
    return Promise.resolve(true);
  }
  prepareAnalysisRun() {
    return Promise.resolve();
  }
  recordAnalysisFailure(input: { failureMessage: string }) {
    this.analysisFailureMessage = input.failureMessage;
    return Promise.resolve(true);
  }
  recordAdvice() {
    return Promise.resolve(true);
  }
  requestArtworkDeletion() {
    return Promise.resolve({
      artworkId,
      attemptNumber: 1,
      deletionId: "05f957fa-1938-47d7-8f15-fcd82bcf21e7",
      objectKey: "users/test/artwork.jpg",
      status:
        this.deletionStatus === "COMPLETED"
          ? ("COMPLETED" as const)
          : ("PENDING" as const),
      updatedAt: now,
    });
  }
}

class MemoryPracticeQueue implements PracticeAnalysisQueue {
  job: PracticeAnalysisJob | null = null;
  enqueue(job: PracticeAnalysisJob) {
    this.job = job;
    return Promise.resolve();
  }
}

class MemoryArtworkDeletionQueue implements ArtworkDeletionQueue {
  job: ArtworkDeletionJob | null = null;
  enqueue(job: ArtworkDeletionJob) {
    this.job = job;
    return Promise.resolve();
  }
}

class FailingArtworkDeletionQueue implements ArtworkDeletionQueue {
  enqueue() {
    return Promise.reject(new Error("Redis unavailable"));
  }
}

class MemoryStorage implements ObjectStorage {
  deletedKey: string | null = null;
  downloadUrlRequests = 0;
  createDownloadUrl(input: { objectKey: string }) {
    this.downloadUrlRequests += 1;
    return Promise.resolve(`https://private.example/${input.objectKey}`);
  }
  createUploadUrl() {
    return Promise.resolve("https://private.example/upload");
  }
  deletePrivateObject(objectKey: string) {
    this.deletedKey = objectKey;
    return Promise.resolve();
  }
  deletePublicObject() {
    return Promise.resolve();
  }
  headPrivateObject() {
    return Promise.resolve(null);
  }
  readPrivateObject() {
    return Promise.reject(new Error("not used"));
  }
}

describe("PracticeService", () => {
  it("sanitizes worker diagnostics before persisting an analysis failure", async () => {
    const previousToken = process.env.INTERNAL_WORKER_TOKEN;
    process.env.INTERNAL_WORKER_TOKEN = "test-worker-token";
    const repository = new MemoryPracticeRepository();
    try {
      const service = new PracticeService(
        repository,
        new MemoryStorage(),
        new MemoryPracticeQueue(),
        new MemoryArtworkDeletionQueue(),
        allowingPrivacyService,
      );
      await service.recordAdviceFailure(
        record.attempts[0]!.attemptId,
        "test-worker-token",
        {
          failureCode: "STRUCTURE_ANALYSIS_FAILED",
          failureMessage:
            "GET https://storage.example/user.jpg?token=private-token failed",
          masterObjectKey: "content/glyphs/master.webp",
          userObjectKey: "users/test/artwork.jpg",
        },
      );

      assert.equal(
        repository.analysisFailureMessage,
        "GET [redacted-url] failed",
      );
    } finally {
      if (previousToken === undefined) delete process.env.INTERNAL_WORKER_TOKEN;
      else process.env.INTERNAL_WORKER_TOKEN = previousToken;
    }
  });

  it("returns a public share summary without signing user artwork URLs", async () => {
    const storage = new MemoryStorage();
    const service = new PracticeService(
      new MemoryPracticeRepository(),
      storage,
      new MemoryPracticeQueue(),
      new MemoryArtworkDeletionQueue(),
      allowingPrivacyService,
    );

    const result = await service.getPublicShareSummary("a".repeat(43), now);

    assert.deepEqual(result, {
      attemptCount: 1,
      character: "永",
      master: { calligrapherName: "欧阳询", workTitle: "九成宫醴泉铭" },
    });
    assert.equal(storage.downloadUrlRequests, 0);
  });

  it("preserves an existing favorite group unless an explicit move is requested", async () => {
    const repository = new MemoryPracticeRepository();
    const service = new PracticeService(
      repository,
      new MemoryStorage(),
      new MemoryPracticeQueue(),
      new MemoryArtworkDeletionQueue(),
      allowingPrivacyService,
    );

    await service.favorite("user-id", glyphId);
    assert.equal(repository.favoriteGroupId, undefined);
    await service.favorite("user-id", glyphId, { groupId: null });
    assert.equal(repository.favoriteGroupId, null);
  });

  it("normalizes group names and validates reorder direction", async () => {
    const repository = new MemoryPracticeRepository();
    const service = new PracticeService(
      repository,
      new MemoryStorage(),
      new MemoryPracticeQueue(),
      new MemoryArtworkDeletionQueue(),
      allowingPrivacyService,
    );

    await service.createFavoriteGroup("user-id", { name: "  颜体   入门  " });
    assert.equal(repository.favoriteGroupName, "颜体 入门");
    await service.reorderFavorite("user-id", glyphId, { direction: "UP" });
    assert.equal(repository.favoriteReorderDirection, "UP");
    await assert.rejects(() =>
      service.reorderFavorite("user-id", glyphId, { direction: "LEFT" }),
    );
  });

  it("creates a practice view with short-lived private attempt URLs", async () => {
    const service = new PracticeService(
      new MemoryPracticeRepository(),
      new MemoryStorage(),
      new MemoryPracticeQueue(),
      new MemoryArtworkDeletionQueue(),
      allowingPrivacyService,
    );
    const result = await service.createPractice("user-id", {
      artworkId,
      glyphId,
    });
    assert.equal(result.character, "永");
    assert.equal(
      result.attempts[0]?.imageUrl,
      "https://private.example/users/test/artwork.jpg",
    );
    assert.match(result.master.imageUrl ?? "", /content\/glyphs\/master.webp$/);
  });

  it("keeps a failed analysis terminal during practice polling", async () => {
    const repository = new MemoryPracticeRepository();
    repository.findOwnedPractice = () =>
      Promise.resolve({
        ...record,
        attempts: record.attempts.map((attempt) => ({
          ...attempt,
          analysis: {
            failureCode: "STRUCTURE_ANALYSIS_FAILED",
            status: "FAILED" as const,
          },
        })),
      });
    const queue = new MemoryPracticeQueue();
    const service = new PracticeService(
      repository,
      new MemoryStorage(),
      queue,
      new MemoryArtworkDeletionQueue(),
      allowingPrivacyService,
    );

    const result = await service.getPractice("user-id", sessionId);

    assert.equal(result.attempts[0]?.analysis?.status, "FAILED");
    assert.equal(queue.job, null);
  });

  it("stores only a hash of an unguessable share token", async () => {
    const repository = new MemoryPracticeRepository();
    const service = new PracticeService(
      repository,
      new MemoryStorage(),
      new MemoryPracticeQueue(),
      new MemoryArtworkDeletionQueue(),
      allowingPrivacyService,
    );
    const result = await service.createShare(
      "user-id",
      sessionId,
      new Date("2026-07-18T00:00:00.000Z"),
    );
    const rawToken = result.url.split("/").at(-1) ?? "";
    assert.equal(repository.shareHash?.length, 64);
    assert.notEqual(repository.shareHash, rawToken);
    assert.equal(result.expiresAt, "2026-08-17T00:00:00.000Z");
  });

  it("does not create a public link without public-sharing permission", async () => {
    const deniedPrivacy = new PrivacyService({
      getPreferences: () =>
        Promise.resolve({
          allowArtworkStorage: true,
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
    const service = new PracticeService(
      new MemoryPracticeRepository(),
      new MemoryStorage(),
      new MemoryPracticeQueue(),
      new MemoryArtworkDeletionQueue(),
      deniedPrivacy,
    );

    await assert.rejects(() => service.createShare("user-id", sessionId, now));
  });

  it("revokes access and queues physical deletion without deleting in the API", async () => {
    const storage = new MemoryStorage();
    const deletionQueue = new MemoryArtworkDeletionQueue();
    const service = new PracticeService(
      new MemoryPracticeRepository(),
      storage,
      new MemoryPracticeQueue(),
      deletionQueue,
      allowingPrivacyService,
    );
    const result = await service.deleteArtwork("user-id", artworkId);
    assert.equal(storage.deletedKey, null);
    assert.equal(deletionQueue.job?.objectKey, "users/test/artwork.jpg");
    assert.equal(result.status, "DELETION_PENDING");
  });

  it("persists a retryable failure when the deletion queue is unavailable", async () => {
    const repository = new MemoryPracticeRepository();
    const service = new PracticeService(
      repository,
      new MemoryStorage(),
      new MemoryPracticeQueue(),
      new FailingArtworkDeletionQueue(),
      allowingPrivacyService,
    );

    const result = await service.deleteArtwork("user-id", artworkId);

    assert.equal(result.status, "FAILED");
    assert.equal(repository.deletionStatus, "FAILED");
  });

  it("accepts bounded measurement-backed structure advice", async () => {
    const previousToken = process.env.INTERNAL_WORKER_TOKEN;
    process.env.INTERNAL_WORKER_TOKEN = "test-worker-token";
    const metrics = {
      anomalies: [],
      bbox_height_ratio: 0.8,
      bbox_left_ratio: 0.1,
      bbox_top_ratio: 0.1,
      bbox_width_ratio: 0.75,
      centroid_x: 0.48,
      centroid_y: 0.52,
      confidence: 1,
      foreground_ratio: 0.2,
      ink_aspect_ratio: 0.94,
      normalization: {
        canvas_height: 512,
        canvas_width: 512,
        offset_x: 0,
        offset_y: 0,
        scale: 1,
        source_height: 512,
        source_width: 512,
        version: "glyph-normalization-v1",
      },
      spatial_distribution: {
        bottom_left: 0.25,
        bottom_right: 0.25,
        top_left: 0.25,
        top_right: 0.25,
      },
    };
    try {
      const service = new PracticeService(
        new MemoryPracticeRepository(),
        new MemoryStorage(),
        new MemoryPracticeQueue(),
        new MemoryArtworkDeletionQueue(),
        allowingPrivacyService,
      );
      const result = await service.recordAdvice(
        record.attempts[0]!.attemptId,
        "test-worker-token",
        {
          provenance: {
            masterChecksumSha256: "a".repeat(64),
            masterObjectKey: "content/glyphs/master.webp",
            measurementVersion: "structure-measurement-v2",
            modelVersion: "no-ml-geometry-v1",
            normalizationVersion: "glyph-normalization-v1",
            ruleVersion: "structure-v1",
            userChecksumSha256: "b".repeat(64),
            userObjectKey: "users/test/artwork.jpg",
          },
          result: {
            advanced_analysis_status: "UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE",
            master: metrics,
            measurement_version: "structure-measurement-v2",
            model_version: "no-ml-geometry-v1",
            normalization_version: "glyph-normalization-v1",
            status: "OK",
            suggestions: [
              {
                action: "略向左收",
                code: "CENTER_X",
                evidence: "重心偏右",
                phenomenon: "重心",
              },
            ],
            threshold_version: "structure-v1",
            user: metrics,
          },
        },
        now,
      );
      assert.equal(result.status, "READY");
    } finally {
      if (previousToken === undefined) delete process.env.INTERNAL_WORKER_TOKEN;
      else process.env.INTERNAL_WORKER_TOKEN = previousToken;
    }
  });

  it("rejects malformed structure coordinates before persistence", async () => {
    const previousToken = process.env.INTERNAL_WORKER_TOKEN;
    process.env.INTERNAL_WORKER_TOKEN = "test-worker-token";
    try {
      const service = new PracticeService(
        new MemoryPracticeRepository(),
        new MemoryStorage(),
        new MemoryPracticeQueue(),
        new MemoryArtworkDeletionQueue(),
        allowingPrivacyService,
      );
      await assert.rejects(() =>
        service.recordAdvice(
          record.attempts[0]!.attemptId,
          "test-worker-token",
          {
            provenance: {},
            result: {
              master: { bbox_height_ratio: 0.8 },
              suggestions: [],
              threshold_version: "structure-v1",
              user: { bbox_height_ratio: 0.8 },
            },
          },
        ),
      );
    } finally {
      if (previousToken === undefined) delete process.env.INTERNAL_WORKER_TOKEN;
      else process.env.INTERNAL_WORKER_TOKEN = previousToken;
    }
  });

  it("records a bounded terminal analysis failure", async () => {
    const previousToken = process.env.INTERNAL_WORKER_TOKEN;
    process.env.INTERNAL_WORKER_TOKEN = "test-worker-token";
    try {
      const service = new PracticeService(
        new MemoryPracticeRepository(),
        new MemoryStorage(),
        new MemoryPracticeQueue(),
        new MemoryArtworkDeletionQueue(),
        allowingPrivacyService,
      );
      const result = await service.recordAdviceFailure(
        record.attempts[0]!.attemptId,
        "test-worker-token",
        {
          failureCode: "STRUCTURE_ANALYSIS_FAILED",
          failureMessage: "AI service timed out",
          masterObjectKey: "content/glyphs/master.webp",
          userObjectKey: "users/test/artwork.jpg",
        },
      );
      assert.equal(result.status, "FAILED");
    } finally {
      if (previousToken === undefined) delete process.env.INTERNAL_WORKER_TOKEN;
      else process.env.INTERNAL_WORKER_TOKEN = previousToken;
    }
  });
});
