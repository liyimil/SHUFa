import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import {
  corsConfiguration,
  helmetMiddleware,
  requestMetadataMiddleware,
} from "../src/http-boundary.js";
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from "../src/catalog/catalog.repository.js";
import {
  IDENTITY_REPOSITORY,
  type IdentityRepository,
} from "../src/identity/identity.repository.js";
import {
  PRIVACY_REPOSITORY,
  type PrivacyPreferencesRecord,
  type PrivacyRepository,
} from "../src/privacy/privacy.repository.js";
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from "../src/upload/upload.repository.js";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../src/upload/object-storage.js";
import {
  ANALYSIS_REPOSITORY,
  type AnalysisRepository,
} from "../src/analysis/analysis.repository.js";
import {
  ANALYSIS_QUEUE,
  type ArtworkAnalysisQueue,
} from "../src/analysis/analysis.queue.js";
import {
  FEEDBACK_REPOSITORY,
  type FeedbackRepository,
} from "../src/feedback/feedback.repository.js";
import {
  INSIGHTS_REPOSITORY,
  type InsightsRepository,
} from "../src/insights/insights.repository.js";
import {
  PRACTICE_REPOSITORY,
  type PracticeRepository,
} from "../src/practice/practice.repository.js";
import {
  PRACTICE_ANALYSIS_QUEUE,
  type PracticeAnalysisQueue,
} from "../src/practice/practice-analysis.queue.js";
import {
  ARTWORK_DELETION_QUEUE,
  type ArtworkDeletionQueue,
} from "../src/practice/artwork-deletion.queue.js";

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

const privacyRecord: PrivacyPreferencesRecord = {
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
  updatePreferences: () => Promise.resolve(privacyRecord),
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
  findOwnedUpload: () => Promise.resolve(null),
  finishPendingUploadCancellation: () => Promise.resolve(false),
  markUploaded: () => Promise.resolve(null as never),
};

const objectStorage: ObjectStorage = {
  createDownloadUrl: () => Promise.resolve("https://storage.example/download"),
  createUploadUrl: () => Promise.resolve("https://storage.example/upload"),
  deletePrivateObject: () => Promise.resolve(),
  deletePublicObject: () => Promise.resolve(),
  headPrivateObject: () => Promise.resolve(null as never),
  readPrivateObject: () => Promise.resolve(new Uint8Array()),
};

const analysisRepository: AnalysisRepository = {
  confirmCharacter: () => Promise.resolve(null as never),
  findOwnedArtwork: () => Promise.resolve(null as never),
  recordFailure: () => Promise.resolve(null as never),
  recordResult: () => Promise.resolve(null),
};

const artworkAnalysisQueue: ArtworkAnalysisQueue = {
  enqueue: () => Promise.resolve(),
};

const feedbackRepository: FeedbackRepository = {
  create: () => Promise.resolve({ id: "fb-1", status: "OPEN" }),
  isValidReference: () => Promise.resolve(true),
  listByUser: () => Promise.resolve([]),
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

const practiceRepository: PracticeRepository = {
  addAttempt: () => Promise.resolve(null as never),
  createFavorite: () => Promise.resolve(false),
  createFavoriteGroup: () => Promise.resolve(null as never),
  createPractice: () => Promise.resolve(null as never),
  createShare: () => Promise.resolve(null as never),
  completeArtworkDeletion: () => Promise.resolve(false),
  failArtworkDeletion: () => Promise.resolve(false),
  findOwnedArtworkDeletion: () => Promise.resolve(null),
  findOwnedPractice: () => Promise.resolve(null),
  findPublicShare: () => Promise.resolve(null),
  listPractices: () => Promise.resolve([]),
  listFavorites: () => Promise.resolve({ groups: [], ungrouped: [] }),
  prepareAnalysisRun: () => Promise.resolve(),
  recordAnalysisFailure: () => Promise.resolve(false),
  recordAdvice: () => Promise.resolve(false),
  removeFavorite: () => Promise.resolve(),
  removeFavoriteGroup: () => Promise.resolve(false),
  reorderFavorite: () => Promise.resolve(false),
  reorderFavoriteGroup: () => Promise.resolve(false),
  requestArtworkDeletion: () => Promise.resolve(null as never),
  revokeShare: () => Promise.resolve(false),
  updateFavoriteGroup: () => Promise.resolve(false),
  switchPracticeGlyph: () => Promise.resolve(null),
};

const practiceAnalysisQueue: PracticeAnalysisQueue = {
  enqueue: () => Promise.resolve(),
};

const artworkDeletionQueue: ArtworkDeletionQueue = {
  enqueue: () => Promise.resolve(),
};

describe("security headers (helmet)", () => {
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

  it("sets X-Content-Type-Options: nosniff", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  });

  it("sets X-Frame-Options: DENY", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200);
    assert.equal(response.headers["x-frame-options"], "DENY");
  });

  it("sets Referrer-Policy: no-referrer", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200);
    assert.equal(response.headers["referrer-policy"], "no-referrer");
  });

  it("sets Permissions-Policy to disable camera, microphone, geolocation", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200);
    const policy = response.headers["permissions-policy"] ?? "";
    assert.match(policy, /camera=\(\)/);
    assert.match(policy, /microphone=\(\)/);
    assert.match(policy, /geolocation=\(\)/);
  });

  it("sets Strict-Transport-Security with includeSubDomains", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200);
    const hsts = response.headers["strict-transport-security"] ?? "";
    assert.match(hsts, /max-age=\d+/);
    assert.match(hsts, /includeSubDomains/);
  });

  it("sets Content-Security-Policy with safe defaults", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200);
    const csp = response.headers["content-security-policy"] ?? "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-src 'none'/);
  });

  it("sets X-Request-Id from the request header", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("X-Request-Id", "my-custom-id-42")
      .expect(200);
    assert.equal(response.headers["x-request-id"], "my-custom-id-42");
  });

  it("generates a UUID when no X-Request-Id is supplied", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200);
    assert.match(
      response.headers["x-request-id"] ?? "",
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("rate limiting (throttler)", () => {
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

  it("includes rate limit headers on responses", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    // ThrottlerGuard sets these headers on non-skipped endpoints
    assert.ok(
      response.headers["ratelimit"] !== undefined ||
        response.headers["x-ratelimit-limit"] !== undefined,
      "Expected rate limit headers to be present",
    );
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const identityEndpoint = "/api/v1/identity/anonymous";
    let got429 = false;

    // Default rate limit is 100 per 60s; send 105 requests to trigger 429
    for (let i = 0; i < 105; i++) {
      const response = await request(app.getHttpServer()).post(
        identityEndpoint,
      );
      if (response.status === 429) {
        got429 = true;
        break;
      }
    }

    assert.ok(got429, "Expected a 429 Too Many Requests response");
  });

  it("does not rate-limit health endpoint even under load", async () => {
    // Health controller has @SkipThrottle(); send many requests
    for (let i = 0; i < 20; i++) {
      await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    }
  });
});

describe("CORS configuration", () => {
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

  it("sets Access-Control-Allow-Credentials to true", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  });

  it("reflects the Origin header for allowed origins", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .set("Origin", "http://localhost:3000")
      .expect(201);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "http://localhost:3000",
    );
  });

  it("rejects disallowed origins by not reflecting them", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .set("Origin", "http://evil.example.com")
      .expect(201);
    assert.notEqual(
      response.headers["access-control-allow-origin"],
      "http://evil.example.com",
    );
  });

  it("handles preflight OPTIONS requests", async () => {
    const response = await request(app.getHttpServer())
      .options("/api/v1/identity/anonymous")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type");
    assert.ok(response.status === 200 || response.status === 204);
  });
});

describe("cookie security attributes", () => {
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

  it("sets calligraphy_rt cookie as HttpOnly on web anonymous session", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/web/anonymous")
      .expect(201);
    const setCookie = response.headers["set-cookie"];
    assert.ok(setCookie, "Expected Set-Cookie header");
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const rtCookie = cookies.find((c: string) =>
      c.startsWith("calligraphy_rt="),
    );
    assert.ok(rtCookie, "Expected calligraphy_rt cookie");
    assert.match(rtCookie!, /HttpOnly/i);
    assert.match(rtCookie!, /SameSite=Strict/i);
    assert.match(rtCookie!, /Path=\/api\/v1\/identity/i);
  });

  it("clears calligraphy_rt cookie on web revoke", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/web/revoke")
      .expect(201);
    const setCookie = response.headers["set-cookie"];
    assert.ok(setCookie, "Expected Set-Cookie header");
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const rtCookie = cookies.find((c: string) =>
      c.startsWith("calligraphy_rt="),
    );
    assert.ok(rtCookie, "Expected calligraphy_rt cookie to be cleared");
    // Cleared cookies have empty value or Max-Age=0
    assert.ok(
      rtCookie!.includes("calligraphy_rt=;") || /Max-Age=0/.test(rtCookie!),
      "Expected cookie to be cleared",
    );
  });

  it("returns 401 when a web refresh cookie is missing", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/web/refresh")
      .expect(401);

    assert.equal(response.body.code, "REFRESH_TOKEN_REQUIRED");
  });

  it("does not set calligraphy_at (access token) as a cookie", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/web/anonymous")
      .expect(201);
    const setCookie = response.headers["set-cookie"];
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      const atCookie = cookies.find((c: string) =>
        c.startsWith("calligraphy_at="),
      );
      assert.equal(
        atCookie,
        undefined,
        "Access token should not be set as a cookie by the API",
      );
    }
  });
});

describe("input validation boundaries", () => {
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

  it("rejects malformed JSON body with 400", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/refresh")
      .set("Content-Type", "application/json")
      .send("{not valid json}");
    assert.equal(response.status, 400);
  });

  it("rejects missing required fields on refresh endpoint", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/refresh")
      .set("Content-Type", "application/json")
      .send({});
    // Missing refreshToken is treated as unauthorized, not bad request
    assert.ok(
      response.status === 400 || response.status === 401,
      `Expected 400 or 401, got ${response.status}`,
    );
  });

  it("rejects invalid phone number format on SMS send", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/sms/send")
      .set("Content-Type", "application/json")
      .send({ phone: "not-a-phone-number" });
    assert.equal(response.status, 400);
  });

  it("rejects empty phone number on SMS send", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/sms/send")
      .set("Content-Type", "application/json")
      .send({ phone: "" });
    assert.equal(response.status, 400);
  });

  it("rejects missing code on SMS verify", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/identity/sms/verify")
      .set("Content-Type", "application/json")
      .send({ phone: "13800138000" });
    // Missing code is treated as verification failure (unauthorized)
    assert.ok(
      response.status === 400 || response.status === 401,
      `Expected 400 or 401, got ${response.status}`,
    );
  });

  it("rejects non-UUID practice session ID", async () => {
    // First create a session to get a valid token
    const anonResponse = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    const accessToken = anonResponse.body.accessToken;

    const response = await request(app.getHttpServer())
      .get("/api/v1/practices/not-a-uuid")
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(response.status, 400);

    // Cleanup
    await request(app.getHttpServer())
      .post("/api/v1/identity/revoke")
      .send({ refreshToken: anonResponse.body.refreshToken });
  });

  it("rejects non-UUID glyph ID in glyph switch", async () => {
    // First create a session to get a valid token
    const anonResponse = await request(app.getHttpServer())
      .post("/api/v1/identity/anonymous")
      .expect(201);
    const accessToken = anonResponse.body.accessToken;
    const refreshToken = anonResponse.body.refreshToken;

    // Try to switch glyph with invalid session ID and glyph ID
    const response = await request(app.getHttpServer())
      .patch("/api/v1/practices/not-a-uuid/glyph")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ glyphId: "also-not-a-uuid" });
    assert.equal(response.status, 400);

    // Cleanup
    await request(app.getHttpServer())
      .post("/api/v1/identity/revoke")
      .send({ refreshToken });
  });
});

describe("internal endpoint security", () => {
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

  it("rejects internal endpoints without X-Internal-Token", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/internal/artwork-deletions/deletion-id/complete")
      .send({ attemptNumber: 1, objectKey: "test/key" });
    assert.equal(response.status, 401);
  });

  it("rejects internal endpoints with wrong X-Internal-Token", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/internal/artwork-deletions/deletion-id/complete")
      .set("X-Internal-Token", "wrong-token")
      .send({ attemptNumber: 1, objectKey: "test/key" });
    assert.equal(response.status, 401);
  });

  it("accepts internal endpoints with correct X-Internal-Token", async () => {
    const response = await request(app.getHttpServer())
      .post(
        "/api/v1/internal/artwork-deletions/00000000-0000-4000-8000-000000000000/complete",
      )
      .set("X-Internal-Token", "test-worker-token")
      .send({ attemptNumber: 1, objectKey: "test/key" });
    // 404 is expected (deletion not found), but NOT 401 — auth passed
    assert.notEqual(response.status, 401);
  });
});
