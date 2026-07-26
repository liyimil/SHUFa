import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import sharp from "sharp";
import request from "supertest";

// Set high rate limit before loading AppModule
process.env.RATE_LIMIT_MAX = "10000";
const { AppModule } = await import("../src/app.module.js");
import {
  corsConfiguration,
  helmetMiddleware,
  requestMetadataMiddleware,
} from "../src/http-boundary.js";
import {
  ARTWORK_DELETION_QUEUE,
  type ArtworkDeletionJob,
  type ArtworkDeletionQueue,
} from "../src/practice/artwork-deletion.queue.js";
import {
  ANALYSIS_QUEUE,
  type ArtworkAnalysisQueue,
} from "../src/analysis/analysis.queue.js";
import {
  ANALYSIS_REPOSITORY,
  type AnalysisRepository,
} from "../src/analysis/analysis.repository.js";
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from "../src/catalog/catalog.repository.js";
import {
  IDENTITY_REPOSITORY,
  type IdentityRepository,
} from "../src/identity/identity.repository.js";
import {
  FEEDBACK_REPOSITORY,
  type FeedbackRepository,
} from "../src/feedback/feedback.repository.js";
import {
  INSIGHTS_REPOSITORY,
  type InsightsRepository,
} from "../src/insights/insights.repository.js";
import {
  PRIVACY_REPOSITORY,
  type PrivacyPreferencesRecord,
  type PrivacyRepository,
} from "../src/privacy/privacy.repository.js";
import {
  PRACTICE_REPOSITORY,
  type PracticeRepository,
} from "../src/practice/practice.repository.js";
import {
  PRACTICE_ANALYSIS_QUEUE,
  type PracticeAnalysisQueue,
} from "../src/practice/practice-analysis.queue.js";
import type { PracticeRecord } from "../src/practice/practice.types.js";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../src/upload/object-storage.js";

const uploadedArtworkBytes = await sharp({
  create: {
    background: "white",
    channels: 3,
    height: 256,
    width: 256,
  },
})
  .jpeg()
  .toBuffer();
let uploadedArtworkObjectBytes = Uint8Array.from(uploadedArtworkBytes);
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from "../src/upload/upload.repository.js";

const repository: CatalogRepository = {
  findPublishedGlyphById: () => Promise.resolve(null),
  findPublishedGlyphsByCharacter(character, filters) {
    return Promise.resolve({
      canonicalCharacter: character,
      facets: { calligraphers: [], scriptStyles: [], works: [] },
      filters,
      glyphs: [],
      query: character,
    });
  },
};

const identityRepository: IdentityRepository = {
  createAnonymousUserWithSession: () =>
    Promise.resolve({ userId: "3fe537fd-6601-43f0-a31d-781bd5bde945" }),
  createRegisteredUserWithSession: () =>
    Promise.resolve({ userId: "3fe537fd-6601-43f0-a31d-781bd5bde945" }),
  createSessionForUser: () => Promise.resolve(),
  findUserByPhoneHash: () => Promise.resolve(null),
  isActiveUser: () => Promise.resolve(true),
  revokeSession: () => Promise.resolve(),
  rotateSession: () =>
    Promise.resolve({
      kind: "anonymous",
      userId: "3fe537fd-6601-43f0-a31d-781bd5bde945",
    }),
  upgradeAnonymousWithSession: () => Promise.resolve(null),
};

let privacyRecord: PrivacyPreferencesRecord = {
  allowArtworkStorage: true,
  allowModelTraining: false,
  allowPublicSharing: false,
  policyVersion: "privacy-v1",
  sharingUpdatedAt: new Date("2026-07-18T00:00:00.000Z"),
  storageUpdatedAt: new Date("2026-07-18T00:00:00.000Z"),
  trainingUpdatedAt: new Date("2026-07-18T00:00:00.000Z"),
  updatedAt: new Date("2026-07-18T00:00:00.000Z"),
};
const privacyRepository: PrivacyRepository = {
  getPreferences: () => Promise.resolve(privacyRecord),
  updatePreferences: (_userId, changes, policyVersion, now) => {
    privacyRecord = {
      ...privacyRecord,
      ...changes,
      policyVersion,
      updatedAt: now,
    };
    return Promise.resolve(privacyRecord);
  },
};

const practiceSessionId = "782be5aa-ec0b-4bf8-a8d9-92aeb9ae9181";
const practiceAttemptId = "b262b111-8514-40fe-818c-39a6151994c8";
const practiceArtworkId = "d450b9ee-0b7c-4b8f-b9c6-377dcd2bc1bb";
const practiceGlyphId = "e57cc9cf-2f2e-4605-b849-3a6412b37e30";
const shareId = "cd3f8528-a344-478b-8a2e-29f912697dbe";
const deletionId = "73028998-55d5-4d02-856d-302c8683889a";
const practiceRecord: PracticeRecord = {
  attempts: [
    {
      advice: null,
      analysis: null,
      artworkId: practiceArtworkId,
      attemptId: practiceAttemptId,
      createdAt: new Date("2026-07-18T00:00:00.000Z"),
      mimeType: "image/jpeg",
      objectKey: "users/test/artworks/practice/original.jpg",
      sequence: 1,
    },
  ],
  character: "永",
  createdAt: new Date("2026-07-18T00:00:00.000Z"),
  id: practiceSessionId,
  master: {
    calligrapherName: "欧阳询",
    glyphId: practiceGlyphId,
    imageObjectKey: "content/glyphs/master.webp",
    workTitle: "九成宫醴泉铭",
  },
};
let practiceShareRevoked = false;
let practiceArtworkDeleted = false;
let practiceDeletionStatus: "PENDING" | "COMPLETED" | "FAILED" = "PENDING";
const practiceRepository: PracticeRepository = {
  addAttempt: () => Promise.resolve(practiceRecord),
  createFavorite: () => Promise.resolve(true),
  createFavoriteGroup: (_userId, name) =>
    Promise.resolve({ id: practiceGlyphId, name, sortOrder: 0 }),
  createPractice: () => Promise.resolve(practiceRecord),
  createShare: () => {
    practiceShareRevoked = false;
    return Promise.resolve({ id: shareId });
  },
  completeArtworkDeletion: () => {
    practiceDeletionStatus = "COMPLETED";
    practiceArtworkDeleted = true;
    return Promise.resolve(true);
  },
  failArtworkDeletion: () => {
    practiceDeletionStatus = "FAILED";
    return Promise.resolve(true);
  },
  findOwnedArtworkDeletion: () =>
    Promise.resolve({
      artworkId: practiceArtworkId,
      deletionId,
      status:
        practiceDeletionStatus === "COMPLETED"
          ? ("DELETED" as const)
          : practiceDeletionStatus === "FAILED"
            ? ("FAILED" as const)
            : ("DELETION_PENDING" as const),
      updatedAt: "2026-07-18T00:00:00.000Z",
    }),
  findOwnedPractice: () => Promise.resolve(practiceRecord),
  findPublicShare: () =>
    Promise.resolve(practiceShareRevoked ? null : practiceRecord),
  listPractices: () => Promise.resolve([practiceRecord]),
  listFavorites: () => Promise.resolve({ groups: [], ungrouped: [] }),
  prepareAnalysisRun: () => Promise.resolve(),
  recordAnalysisFailure: (input) => {
    if (input.attemptId !== practiceAttemptId) return Promise.resolve(false);
    practiceRecord.attempts[0]!.analysis = {
      failureCode: input.failureCode,
      status: "FAILED",
    };
    return Promise.resolve(true);
  },
  recordAdvice: () => Promise.resolve(true),
  switchPracticeGlyph: () => Promise.resolve(practiceRecord),
  requestArtworkDeletion: () => {
    practiceShareRevoked = true;
    practiceDeletionStatus = "PENDING";
    return Promise.resolve({
      artworkId: practiceArtworkId,
      attemptNumber: 1,
      deletionId,
      objectKey: practiceRecord.attempts[0]!.objectKey,
      status: "PENDING" as const,
      updatedAt: new Date("2026-07-18T00:00:00.000Z"),
    });
  },
  removeFavorite: () => Promise.resolve(),
  removeFavoriteGroup: () => Promise.resolve(true),
  reorderFavorite: () => Promise.resolve(true),
  reorderFavoriteGroup: () => Promise.resolve(true),
  revokeShare: () => {
    practiceShareRevoked = true;
    return Promise.resolve(true);
  },
  updateFavoriteGroup: () => Promise.resolve(true),
};
const practiceAnalysisQueue: PracticeAnalysisQueue = {
  enqueue: () => Promise.resolve(),
};
let artworkDeletionJob: ArtworkDeletionJob | null = null;
const artworkDeletionQueue: ArtworkDeletionQueue = {
  enqueue: (job) => {
    artworkDeletionJob = job;
    return Promise.resolve();
  },
};

const uploadRepository: UploadRepository = {
  claimPendingUploadCancellation: () => Promise.resolve(null),
  createPendingUpload: () =>
    Promise.resolve({
      artworkId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
      mimeType: "image/jpeg",
      objectKey: "users/test/artworks/test/original.jpg",
      uploadId: "ebbc505b-7df5-4ce7-8f3a-33dc07c4a957",
    }),
  findOwnedUpload: () =>
    Promise.resolve({
      artworkId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
      height: 256,
      mimeType: "image/jpeg",
      objectKey: "users/test/artworks/test/original.jpg",
      sizeBytes: uploadedArtworkObjectBytes.byteLength,
      status: "PENDING_UPLOAD",
      uploadId: "ebbc505b-7df5-4ce7-8f3a-33dc07c4a957",
      width: 256,
    }),
  finishPendingUploadCancellation: () => Promise.resolve(false),
  markUploaded: () =>
    Promise.resolve({
      analysisId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
      artworkId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      mimeType: "image/jpeg",
      objectKey: "users/test/artworks/test/original.jpg",
    }),
};
const artworkAnalysisQueue: ArtworkAnalysisQueue = {
  enqueue: () => Promise.resolve(),
};

const objectStorage: ObjectStorage = {
  createDownloadUrl: () => Promise.resolve("https://storage.example/download"),
  createUploadUrl: () => Promise.resolve("https://storage.example/upload"),
  deletePrivateObject: (objectKey) => {
    deletedPrivateObjectKey = objectKey;
    return Promise.resolve();
  },
  deletePublicObject: () => Promise.resolve(),
  headPrivateObject: () =>
    Promise.resolve({
      checksumSha256: "c".repeat(64),
      contentLength: uploadedArtworkObjectBytes.byteLength,
      contentType: "image/jpeg",
    }),
  readPrivateObject: () => Promise.resolve(uploadedArtworkObjectBytes),
};
let deletedPrivateObjectKey: string | null = null;

const analysisRepository: AnalysisRepository = {
  confirmCharacter: (_artworkId, _userId, character) =>
    Promise.resolve({ character }),
  findOwnedArtwork: (artworkId) =>
    Promise.resolve({
      analysis: {
        findings: [],
        metrics: null,
        status: "PROCESSING",
        thresholdVersion: null,
      },
      artworkId,
      artworkStatus: "PROCESSING",
      confirmedCharacter: null,
      createdAt: "2026-07-18T00:00:00.000Z",
    }),
  recordFailure: () =>
    Promise.resolve({
      artworkId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      status: "FAILED",
    }),
  recordResult: () => Promise.resolve(null),
};

let submittedFeedback: Parameters<FeedbackRepository["create"]>[0] | null =
  null;
const feedbackRepository: FeedbackRepository = {
  create: (input) => {
    submittedFeedback = input;
    return Promise.resolve({
      id: "9627a9d7-4ef9-4d3a-a6d1-7a507b023bd0",
      status: "OPEN",
    });
  },
  isValidReference: () => Promise.resolve(true),
  listByUser: () =>
    Promise.resolve(
      submittedFeedback
        ? [
            {
              accurate: submittedFeedback.accurate,
              createdAt: new Date("2026-07-18T00:00:00.000Z"),
              id: "9627a9d7-4ef9-4d3a-a6d1-7a507b023bd0",
              kind: submittedFeedback.kind,
              message: submittedFeedback.message,
              referenceId: submittedFeedback.referenceId,
              referenceType: submittedFeedback.referenceType,
              resolutionNote: null,
              resolvedAt: null,
              status: "OPEN",
              updatedAt: new Date("2026-07-18T00:00:00.000Z"),
            },
          ]
        : [],
    ),
  listForAdmin: () => Promise.resolve([]),
  updateByAdmin: () => Promise.resolve(null),
};

const insightsRepository: InsightsRepository = {
  isOwnedPracticeSession: () => Promise.resolve(true),
  listAdviceSamples: () => Promise.resolve([]),
  readFunnel: () => Promise.resolve([]),
  recordEvent: () => Promise.resolve("CREATED"),
  saveAdviceReview: () => Promise.resolve(null),
};

describe("application HTTP boundary", () => {
  let app: INestApplication;
  const previousWorkerToken = process.env.INTERNAL_WORKER_TOKEN;

  before(async () => {
    process.env.INTERNAL_WORKER_TOKEN = "test-worker-token";
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CATALOG_REPOSITORY)
      .useValue(repository)
      .overrideProvider(IDENTITY_REPOSITORY)
      .useValue(identityRepository)
      .overrideProvider(PRIVACY_REPOSITORY)
      .useValue(privacyRepository)
      .overrideProvider(UPLOAD_REPOSITORY)
      .useValue(uploadRepository)
      .overrideProvider(OBJECT_STORAGE)
      .useValue(objectStorage)
      .overrideProvider(ANALYSIS_REPOSITORY)
      .useValue(analysisRepository)
      .overrideProvider(ANALYSIS_QUEUE)
      .useValue(artworkAnalysisQueue)
      .overrideProvider(FEEDBACK_REPOSITORY)
      .useValue(feedbackRepository)
      .overrideProvider(INSIGHTS_REPOSITORY)
      .useValue(insightsRepository)
      .overrideProvider(PRACTICE_REPOSITORY)
      .useValue(practiceRepository)
      .overrideProvider(PRACTICE_ANALYSIS_QUEUE)
      .useValue(practiceAnalysisQueue)
      .overrideProvider(ARTWORK_DELETION_QUEUE)
      .useValue(artworkDeletionQueue)
      .compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.use(helmetMiddleware);
    app.use(requestMetadataMiddleware);
    app.enableCors({ ...corsConfiguration(), credentials: true });
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  after(async () => {
    await app.close();
    if (previousWorkerToken === undefined) {
      delete process.env.INTERNAL_WORKER_TOKEN;
    } else {
      process.env.INTERNAL_WORKER_TOKEN = previousWorkerToken;
    }
  });

  it("serves health status", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("Origin", "http://localhost:3000")
      .set("X-Request-Id", "test-request-123")
      .expect(200);

    assert.equal(response.body.service, "api");
    assert.equal(response.body.status, "ok");
    assert.equal(response.headers["x-request-id"], "test-request-123");
    assert.match(
      response.headers["access-control-expose-headers"] ?? "",
      /X-Request-Id/i,
    );
  });

  it("serves a validated empty catalog result", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/characters/${encodeURIComponent("永")}/glyphs`)
      .expect(200);

    assert.deepEqual(response.body, {
      canonicalCharacter: "永",
      facets: { calligraphers: [], scriptStyles: [], works: [] },
      filters: {},
      glyphs: [],
      query: "永",
    });
  });

  it("validates catalog filters and hides unavailable glyph details", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/characters/${encodeURIComponent("永")}/glyphs`)
      .query({ calligrapherId: "invalid" })
      .expect(400);
    await request(app.getHttpServer())
      .get("/api/v1/glyphs/3fe537fd-6601-43f0-a31d-781bd5bde945")
      .expect(404);
  });

  it("rejects non-Han catalog queries", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/characters/A/glyphs")
      .expect(400);

    assert.equal(response.body.code, "INVALID_CHARACTER_QUERY");
  });

  it("creates an anonymous learning session", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);

    assert.equal(response.body.tokenType, "Bearer");
    assert.equal(response.body.user.kind, "anonymous");
    assert.equal(response.body.user.id, "3fe537fd-6601-43f0-a31d-781bd5bde945");
    assert.ok(response.body.accessToken);
    assert.match(response.body.refreshToken, /^[A-Za-z0-9_-]{43}$/);
  });

  it("rotates and revokes anonymous refresh tokens", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);

    const refreshed = await request(app.getHttpServer())
      .post("/api/v1/identity/refresh")
      .send({ refreshToken: session.body.refreshToken })
      .expect(201);
    assert.notEqual(refreshed.body.refreshToken, session.body.refreshToken);

    const revoked = await request(app.getHttpServer())
      .post("/api/v1/identity/revoke")
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(201);
    assert.equal(revoked.body.revoked, true);
  });

  it("requires authentication before creating an upload", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/uploads")
      .send({
        height: 1024,
        clientRequestId: "mobile-request-0001",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        width: 1024,
      })
      .expect(401);
  });

  it("keeps privacy permissions independent at the HTTP boundary", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    const authorization = `Bearer ${session.body.accessToken}`;

    const updated = await request(app.getHttpServer())
      .put("/api/v1/privacy/preferences")
      .set("Authorization", authorization)
      .send({ allowModelTraining: true })
      .expect(200);

    assert.equal(updated.body.allowArtworkStorage, true);
    assert.equal(updated.body.allowPublicSharing, false);
    assert.equal(updated.body.allowModelTraining, true);
  });

  it("creates a signed upload for an active session", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);

    const response = await request(app.getHttpServer())
      .post("/api/v1/uploads")
      .set("Authorization", `Bearer ${session.body.accessToken}`)
      .send({
        height: 1024,
        clientRequestId: "mobile-request-0001",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        width: 1024,
      })
      .expect(201);

    assert.equal(response.body.uploadUrl, "https://storage.example/upload");
    assert.equal(response.body.requiredHeaders["content-type"], "image/jpeg");
  });

  it("completes a verified upload and confirms the handwritten character", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    const authorization = `Bearer ${session.body.accessToken}`;

    const completed = await request(app.getHttpServer())
      .post("/api/v1/uploads/ebbc505b-7df5-4ce7-8f3a-33dc07c4a957/complete")
      .set("Authorization", authorization)
      .expect(201);
    assert.equal(completed.body.status, "PROCESSING");

    const confirmed = await request(app.getHttpServer())
      .post("/api/v1/artworks/53a3e68c-c38c-4b79-90b4-ab1212491184/character")
      .set("Authorization", authorization)
      .send({ character: "永" })
      .expect(201);
    assert.equal(confirmed.body.character, "永");
  });

  it("rejects malformed uploaded bytes at the HTTP completion boundary", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    uploadedArtworkObjectBytes = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02,
    ]);
    try {
      const response = await request(app.getHttpServer())
        .post("/api/v1/uploads/ebbc505b-7df5-4ce7-8f3a-33dc07c4a957/complete")
        .set("Authorization", `Bearer ${session.body.accessToken}`)
        .expect(400);
      assert.equal(response.body.code, "UPLOAD_CONTENT_INVALID");
    } finally {
      uploadedArtworkObjectBytes = Uint8Array.from(uploadedArtworkBytes);
    }
  });

  it("records an authenticated fixed-schema product event", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    const response = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${session.body.accessToken}`)
      .send({
        eventId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
        name: "ARTWORK_UPLOAD_COMPLETED",
        occurredAt: new Date().toISOString(),
      })
      .expect(201);

    assert.equal(response.body.status, "RECORDED");
  });

  it("returns an authenticated artwork processing status", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    const response = await request(app.getHttpServer())
      .get("/api/v1/artworks/artwork-id")
      .set("Authorization", `Bearer ${session.body.accessToken}`)
      .expect(200);

    assert.equal(response.body.analysis.status, "PROCESSING");
  });

  it("accepts a terminal quality failure only at the worker boundary", async () => {
    const response = await request(app.getHttpServer())
      .post(
        "/api/v1/internal/analyses/4b02e7dd-24de-47e3-ab13-1d4a7f952935/failure",
      )
      .set("X-Internal-Token", "test-worker-token")
      .send({
        failureCode: "QUALITY_ANALYSIS_FAILED",
        failureMessage: "AI timeout",
      })
      .expect(201);

    assert.equal(response.body.status, "FAILED");
    await request(app.getHttpServer())
      .post(
        "/api/v1/internal/analyses/4b02e7dd-24de-47e3-ab13-1d4a7f952935/failure",
      )
      .send({
        failureCode: "QUALITY_ANALYSIS_FAILED",
        failureMessage: "AI timeout",
      })
      .expect(401);
  });

  it("submits typed feedback and returns only the current user's progress", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    const authorization = `Bearer ${session.body.accessToken}`;
    const created = await request(app.getHttpServer())
      .post("/api/v1/feedback")
      .set("Authorization", authorization)
      .send({
        kind: "RECOGNITION_ERROR",
        message: "候选字中没有正确结果",
        referenceId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
        referenceType: "Artwork",
      })
      .expect(201);
    assert.equal(created.body.status, "OPEN");

    const progress = await request(app.getHttpServer())
      .get("/api/v1/feedback")
      .set("Authorization", authorization)
      .expect(200);
    assert.equal(progress.body.length, 1);
    assert.equal(progress.body[0].kind, "RECOGNITION_ERROR");
    assert.equal(Object.hasOwn(progress.body[0], "assignedTo"), false);
  });

  it("exposes the authenticated favorite copybook lifecycle", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    const authorization = `Bearer ${session.body.accessToken}`;

    const group = await request(app.getHttpServer())
      .post("/api/v1/favorite-groups")
      .set("Authorization", authorization)
      .send({ name: "颜体入门" })
      .expect(201);
    assert.equal(group.body.name, "颜体入门");

    await request(app.getHttpServer())
      .put(`/api/v1/favorites/glyphs/${practiceGlyphId}`)
      .set("Authorization", authorization)
      .send({ groupId: group.body.id })
      .expect(200);
    const library = await request(app.getHttpServer())
      .get("/api/v1/favorites")
      .set("Authorization", authorization)
      .expect(200);
    assert.deepEqual(library.body, { groups: [], ungrouped: [] });

    await request(app.getHttpServer())
      .post(`/api/v1/favorites/glyphs/${practiceGlyphId}/reorder`)
      .set("Authorization", authorization)
      .send({ direction: "UP" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/favorite-groups/${group.body.id}/reorder`)
      .set("Authorization", authorization)
      .send({ direction: "DOWN" })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/favorites/glyphs/${practiceGlyphId}`)
      .set("Authorization", authorization)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/favorite-groups/${group.body.id}`)
      .set("Authorization", authorization)
      .expect(200);
  });

  it("covers practice failure, sharing, revocation and private deletion", async () => {
    const session = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    const authorization = `Bearer ${session.body.accessToken}`;

    const created = await request(app.getHttpServer())
      .post("/api/v1/practices")
      .set("Authorization", authorization)
      .send({ artworkId: practiceArtworkId, glyphId: practiceGlyphId })
      .expect(201);
    assert.equal(created.body.id, practiceSessionId);
    assert.match(created.body.attempts[0].imageUrl, /^https:\/\/storage/);

    await request(app.getHttpServer())
      .post(
        `/api/v1/internal/practice-attempts/${practiceAttemptId}/advice/failure`,
      )
      .set("X-Internal-Token", "test-worker-token")
      .send({
        failureCode: "STRUCTURE_ANALYSIS_FAILED",
        failureMessage: "AI service unavailable.",
        masterObjectKey: practiceRecord.master.imageObjectKey,
        userObjectKey: practiceRecord.attempts[0]!.objectKey,
      })
      .expect(201);

    const failed = await request(app.getHttpServer())
      .get(`/api/v1/practices/${practiceSessionId}`)
      .set("Authorization", authorization)
      .expect(200);
    assert.equal(failed.body.attempts[0].analysis.status, "FAILED");

    await request(app.getHttpServer())
      .put("/api/v1/privacy/preferences")
      .set("Authorization", authorization)
      .send({ allowPublicSharing: true })
      .expect(200);
    const share = await request(app.getHttpServer())
      .post(`/api/v1/practices/${practiceSessionId}/shares`)
      .set("Authorization", authorization)
      .expect(201);
    const shareToken = String(share.body.url).split("/").at(-1);
    assert.ok(shareToken);
    await request(app.getHttpServer())
      .get(`/api/v1/shares/${shareToken}`)
      .expect(200);
    const shareSummary = await request(app.getHttpServer())
      .get(`/api/v1/shares/${shareToken}/summary`)
      .expect(200);
    assert.deepEqual(shareSummary.body, {
      attemptCount: 1,
      character: "永",
      master: {
        calligrapherName: "欧阳询",
        workTitle: "九成宫醴泉铭",
      },
    });
    assert.equal(Object.hasOwn(shareSummary.body, "attempts"), false);
    assert.equal(JSON.stringify(shareSummary.body).includes("imageUrl"), false);

    await request(app.getHttpServer())
      .delete(`/api/v1/shares/${shareId}`)
      .set("Authorization", authorization)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/shares/${shareToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/shares/${shareToken}/summary`)
      .expect(404);

    const shareBeforeDeletion = await request(app.getHttpServer())
      .post(`/api/v1/practices/${practiceSessionId}/shares`)
      .set("Authorization", authorization)
      .expect(201);
    const shareTokenBeforeDeletion = String(shareBeforeDeletion.body.url)
      .split("/")
      .at(-1);
    assert.ok(shareTokenBeforeDeletion);
    await request(app.getHttpServer())
      .get(`/api/v1/shares/${shareTokenBeforeDeletion}`)
      .expect(200);

    const deletion = await request(app.getHttpServer())
      .delete(`/api/v1/artworks/${practiceArtworkId}`)
      .set("Authorization", authorization)
      .expect(200);
    assert.equal(deletion.body.status, "DELETION_PENDING");
    assert.equal(deletion.body.deletionId, deletionId);
    assert.equal(deletedPrivateObjectKey, null);
    assert.equal(
      artworkDeletionJob?.objectKey,
      practiceRecord.attempts[0]!.objectKey,
    );
    await request(app.getHttpServer())
      .get(`/api/v1/shares/${shareTokenBeforeDeletion}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/internal/artwork-deletions/${deletionId}/complete`)
      .set("X-Internal-Token", "test-worker-token")
      .send({
        attemptNumber: artworkDeletionJob?.attemptNumber,
        objectKey: artworkDeletionJob?.objectKey,
      })
      .expect(201);
    const deletionStatus = await request(app.getHttpServer())
      .get(`/api/v1/artwork-deletions/${deletionId}`)
      .set("Authorization", authorization)
      .expect(200);
    assert.equal(deletionStatus.body.status, "DELETED");
    assert.equal(practiceArtworkDeleted, true);
  });

  it("creates a web cookie session and refreshes via cookie", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/identity/web/anonymous")
      .expect(201);

    assert.ok(created.body.accessToken);
    assert.equal(created.body.user.kind, "anonymous");
    const cookies = created.headers["set-cookie"] as unknown as string[];
    assert.ok(cookies, "Expected Set-Cookie header");
    const refreshCookie = cookies.find((c: string) =>
      c.startsWith("calligraphy_rt="),
    );
    assert.ok(refreshCookie, "Expected refresh token cookie");
    assert.match(refreshCookie!, /HttpOnly/i);
    assert.match(refreshCookie!, /Path=\/api\/v1\/identity/i);

    const refreshed = await request(app.getHttpServer())
      .post("/api/v1/identity/web/refresh")
      .set("Cookie", refreshCookie)
      .expect(201);

    assert.ok(refreshed.body.accessToken);
    assert.equal(refreshed.body.user.kind, "anonymous");
    const refreshedCookies = refreshed.headers[
      "set-cookie"
    ] as unknown as string[];
    const refreshedRefreshCookie = refreshedCookies?.find((c: string) =>
      c.startsWith("calligraphy_rt="),
    );
    assert.ok(refreshedRefreshCookie, "Expected new refresh token cookie");

    const revoked = await request(app.getHttpServer())
      .post("/api/v1/identity/web/revoke")
      .set("Cookie", refreshedRefreshCookie)
      .expect(201);

    assert.equal(revoked.body.revoked, true);
  });
});
