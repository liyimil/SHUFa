import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException, ForbiddenException } from "@nestjs/common";

import type { ObjectStorage } from "../src/upload/object-storage.js";
import type {
  ContentProcessingQueue,
  GlyphCropJob,
  SourceSegmentationJob,
} from "../src/admin/content-processing.queue.js";
import type { ContentAdminRepository } from "../src/admin/content-admin.repository.js";
import { ContentAdminService } from "../src/admin/content-admin.service.js";
import type {
  ContentImportPreparedRow,
  CreateGlyphInput,
  CreateRightsInput,
} from "../src/admin/content-admin.types.js";
import type { PublicCatalogInvalidator } from "../src/admin/public-catalog-invalidator.js";

class MemoryContentAdminRepository implements ContentAdminRepository {
  calligrapherUpdateInput: Record<string, unknown> | null = null;
  historyAudit: Awaited<
    ReturnType<ContentAdminRepository["findContentHistory"]>
  > = null;
  glyphInput: CreateGlyphInput | null = null;
  rightsInput: CreateRightsInput | null = null;
  sourceUploadResult:
    | { status: "CREATED"; uploadId: string }
    | {
        duplicateKind: "SOURCE_ASSET" | "ACTIVE_UPLOAD";
        status: "DUPLICATE";
      } = { status: "CREATED", uploadId: "upload-id" };
  segmentationCandidates: unknown[] = [];
  unpublishResult: { objectKeys: string[] } | null = {
    objectKeys: ["content/glyphs/glyph-id/glyph.webp"],
  };
  importRows: ContentImportPreparedRow[] = [];

  createContentImportBatch(
    actorKey: string,
    input: {
      checksumSha256: string;
      fileName: string;
      rows: ContentImportPreparedRow[];
    },
  ) {
    this.importRows = input.rows;
    const invalidRows = input.rows.filter(
      (row) => row.errors.length > 0,
    ).length;
    return Promise.resolve({
      actorKey,
      checksumSha256: input.checksumSha256,
      committedAt: null,
      createdAt: new Date("2026-07-18T00:00:00.000Z"),
      fileName: input.fileName,
      id: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      invalidRows,
      rows: input.rows.map((row) => ({
        errors: row.errors,
        normalizedData: row.input,
        rawData: row.rawData,
        rowNumber: row.rowNumber,
        targetGlyphId: row.targetGlyphId,
      })),
      status: invalidRows === 0 ? ("READY" as const) : ("INVALID" as const),
      totalRows: input.rows.length,
      validRows: input.rows.length - invalidRows,
    });
  }

  listContentImportBatches() {
    return Promise.resolve([]);
  }

  commitContentImportBatch(_actorKey: string, batchId: string) {
    return Promise.resolve({
      batchId,
      cropJobs: [
        {
          bboxHeight: 120,
          bboxWidth: 100,
          bboxX: 20,
          bboxY: 30,
          glyphId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
          mimeType: "image/jpeg",
          outputObjectKey:
            "content/glyphs/4b02e7dd-24de-47e3-ab13-1d4a7f952935/glyph.webp",
          sourceObjectKey: "content/sources/source.jpg",
        },
      ],
      glyphCount: 1,
      status: "COMMITTED" as const,
    });
  }

  createCalligrapher(
    _actorKey: string,
    input: { name: string; dynasty: string; biography: string | null },
  ) {
    return Promise.resolve({ id: "calligrapher-id", isActive: true, ...input });
  }

  createEdition() {
    return Promise.resolve({ id: "edition-id" });
  }

  createRights(_actorKey: string, input: CreateRightsInput) {
    this.rightsInput = input;
    return Promise.resolve({ id: "rights-id" });
  }

  createSourceUpload() {
    return Promise.resolve(this.sourceUploadResult);
  }

  createWork() {
    return Promise.resolve({ id: "work-id" });
  }

  listCalligraphers() {
    return Promise.resolve([]);
  }

  listWorks() {
    return Promise.resolve([]);
  }

  listEditions() {
    return Promise.resolve([]);
  }

  listRights() {
    return Promise.resolve([]);
  }

  listContentHistory() {
    return Promise.resolve(this.historyAudit ? [this.historyAudit] : []);
  }

  findContentHistory() {
    return Promise.resolve(this.historyAudit);
  }

  updateCalligrapher(
    _actorKey: string,
    _id: string,
    input: Record<string, unknown>,
  ) {
    this.calligrapherUpdateInput = input;
    return Promise.resolve({
      archivedObjectKeys: ["content/glyphs/glyph-id/glyph.webp"],
      record: {
        biography: null,
        dynasty: "唐",
        id: "53a3e68c-c38c-4b79-90b4-ab1212491184",
        isActive: false,
        name: "欧阳询",
      },
    });
  }

  updateWork() {
    return Promise.resolve(null);
  }

  updateEdition() {
    return Promise.resolve(null);
  }

  updateRights() {
    return Promise.resolve(null);
  }

  findSourceUpload() {
    return Promise.resolve(null);
  }

  completeSourceUpload() {
    return Promise.resolve({ sourceAssetId: "source-asset-id" });
  }

  createGlyph(_actorKey: string, input: CreateGlyphInput) {
    this.glyphInput = input;
    return Promise.resolve({
      glyphId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      mimeType: "image/jpeg",
      sourceObjectKey: "content/sources/source.jpg",
    });
  }

  listGlyphs() {
    return Promise.resolve([]);
  }

  listSourceAssets() {
    return Promise.resolve([]);
  }

  findPrivateSourceAsset() {
    return Promise.resolve({
      height: 1600,
      mimeType: "image/jpeg",
      objectKey: "content/sources/source.jpg",
      width: 1200,
    });
  }

  findSegmentationCandidate() {
    return Promise.resolve({
      bboxHeight: 120,
      bboxWidth: 100,
      bboxX: 20,
      bboxY: 30,
      id: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
      sourceAssetId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      status: "PENDING",
    });
  }

  rejectSegmentationCandidate() {
    return Promise.resolve(true);
  }

  listSegmentationJobs() {
    return Promise.resolve([]);
  }

  createSegmentationJob() {
    return Promise.resolve({
      created: true,
      jobId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      mimeType: "image/jpeg",
      sourceObjectKey: "content/sources/source.jpg",
      status: "PENDING" as const,
    });
  }

  markSegmentationProcessing() {
    return Promise.resolve(true);
  }

  recordSegmentationResult(
    _jobId: string,
    _algorithmVersion: string,
    candidates: unknown[],
  ) {
    this.segmentationCandidates = candidates;
    return Promise.resolve(true);
  }

  recordSegmentationFailure() {
    return Promise.resolve(true);
  }

  recordGlyphCrop() {
    return Promise.resolve(true);
  }

  reviewGlyph() {
    return Promise.resolve(true);
  }

  publishGlyph() {
    return Promise.resolve(true);
  }

  unpublishGlyph() {
    return Promise.resolve(this.unpublishResult);
  }

  updateGlyph() {
    return Promise.resolve({
      cropJob: {
        bboxHeight: 420,
        bboxWidth: 320,
        bboxX: 30,
        bboxY: 40,
        mimeType: "image/jpeg",
        sourceObjectKey: "content/sources/source.jpg",
      },
      status: "PROCESSING" as const,
    });
  }
}

const deletedPublicObjects: string[] = [];
const objectStorage: ObjectStorage = {
  createDownloadUrl: () => Promise.resolve("https://storage.example/download"),
  createUploadUrl: () => Promise.resolve("https://storage.example/source"),
  deletePrivateObject: () => Promise.resolve(),
  deletePublicObject: (objectKey) => {
    deletedPublicObjects.push(objectKey);
    return Promise.resolve();
  },
  headPrivateObject: () => Promise.resolve(null),
  readPrivateObject: () => Promise.reject(new Error("not used")),
};

class MemoryCatalogInvalidator implements PublicCatalogInvalidator {
  count = 0;

  invalidate() {
    this.count += 1;
    return Promise.resolve();
  }
}

class MemoryContentQueue implements ContentProcessingQueue {
  job: GlyphCropJob | null = null;
  jobs: GlyphCropJob[] = [];
  segmentationJob: SourceSegmentationJob | null = null;

  enqueueGlyphCrop(job: GlyphCropJob) {
    this.job = job;
    this.jobs.push(job);
    return Promise.resolve();
  }

  enqueueSourceSegmentation(job: SourceSegmentationJob) {
    this.segmentationJob = job;
    return Promise.resolve();
  }
}

describe("ContentAdminService", () => {
  it("normalizes required calligrapher fields", async () => {
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    const result = await service.createCalligrapher("editor@example.com", {
      dynasty: " 唐 ",
      name: " 欧阳询 ",
    });
    assert.equal(result.name, "欧阳询");
    assert.equal(result.dynasty, "唐");
  });

  it("keeps public rights explicit and auditable", async () => {
    const repository = new MemoryContentAdminRepository();
    const service = new ContentAdminService(
      repository,
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    await service.createRights("rights@example.com", {
      allowCommercial: false,
      sourceName: "馆藏开放平台",
      status: "CLEARED_PUBLIC",
      validUntil: "2030-01-01T00:00:00.000Z",
    });
    assert.equal(repository.rightsInput?.status, "CLEARED_PUBLIC");
    assert.equal(repository.rightsInput?.allowCommercial, false);
  });

  it("creates a checksum-bound source upload", async () => {
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    const result = await service.createSourceUpload(
      "editor@example.com",
      {
        checksumSha256: "a".repeat(64),
        editionId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
        height: 2048,
        mimeType: "image/jpeg",
        rightsRecordId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
        sizeBytes: 4096,
        width: 2048,
      },
      new Date("2026-07-18T00:00:00.000Z"),
    );

    assert.equal(result.uploadId, "upload-id");
    assert.equal(result.requiredHeaders["x-amz-meta-sha256"], "a".repeat(64));
    assert.equal(result.expiresAt, "2026-07-18T00:15:00.000Z");
  });

  it("rejects a source image already present in the content pipeline", async () => {
    const repository = new MemoryContentAdminRepository();
    repository.sourceUploadResult = {
      duplicateKind: "SOURCE_ASSET",
      status: "DUPLICATE",
    };
    const service = new ContentAdminService(
      repository,
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    await assert.rejects(
      () =>
        service.createSourceUpload("editor@example.com", {
          checksumSha256: "a".repeat(64),
          editionId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
          height: 2048,
          mimeType: "image/jpeg",
          rightsRecordId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
          sizeBytes: 4096,
          width: 2048,
        }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        (error.getResponse() as { code?: string }).code ===
          "DUPLICATE_SOURCE_IMAGE",
    );
  });

  it("queues source segmentation without creating glyph content", async () => {
    const queue = new MemoryContentQueue();
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      queue,
      new MemoryCatalogInvalidator(),
    );
    const result = await service.createSegmentationJob(
      "editor@example.com",
      "53a3e68c-c38c-4b79-90b4-ab1212491184",
    );
    assert.equal(result.status, "PENDING");
    assert.equal(
      queue.segmentationJob?.sourceObjectKey,
      "content/sources/source.jpg",
    );
  });

  it("validates and records versioned segmentation candidates from the worker", async () => {
    const previousToken = process.env.INTERNAL_WORKER_TOKEN;
    process.env.INTERNAL_WORKER_TOKEN = "worker-token";
    try {
      const repository = new MemoryContentAdminRepository();
      const service = new ContentAdminService(
        repository,
        objectStorage,
        new MemoryContentQueue(),
        new MemoryCatalogInvalidator(),
      );
      const result = await service.recordSegmentationResult(
        "53a3e68c-c38c-4b79-90b4-ab1212491184",
        "worker-token",
        {
          algorithmVersion: "opencv-dilate-contours-v1",
          candidates: [
            {
              bboxHeight: 120,
              bboxWidth: 100,
              bboxX: 20,
              bboxY: 30,
              confidence: 800,
            },
          ],
        },
      );
      assert.equal(result.candidateCount, 1);
      assert.deepEqual(repository.segmentationCandidates, [
        {
          bboxHeight: 120,
          bboxWidth: 100,
          bboxX: 20,
          bboxY: 30,
          confidence: 800,
          sortOrder: 0,
        },
      ]);
    } finally {
      if (previousToken === undefined) delete process.env.INTERNAL_WORKER_TOKEN;
      else process.env.INTERNAL_WORKER_TOKEN = previousToken;
    }
  });

  it("creates a short-lived private source view for the annotation workbench", async () => {
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    const view = await service.createSourceAssetView(
      "53a3e68c-c38c-4b79-90b4-ab1212491184",
    );
    assert.equal(view.url, "https://storage.example/download");
    assert.equal(view.width, 1200);
    assert.equal(view.height, 1600);
  });

  it("accepts a candidate with canonical, observed and variant annotations", async () => {
    const repository = new MemoryContentAdminRepository();
    const queue = new MemoryContentQueue();
    const service = new ContentAdminService(
      repository,
      objectStorage,
      queue,
      new MemoryCatalogInvalidator(),
    );
    const result = await service.acceptSegmentationCandidate(
      "editor@example.com",
      "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
      {
        authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
        canonicalCharacter: "吉",
        characterCandidates: "吉、𠮷",
        observedCharacter: "𠮷",
        transcription: "释文片段",
        variantType: "HISTORICAL",
      },
    );
    assert.equal(result.status, "PROCESSING");
    assert.equal(repository.glyphInput?.character, "吉");
    assert.equal(repository.glyphInput?.observedCharacter, "𠮷");
    assert.deepEqual(repository.glyphInput?.labelCandidates, ["𠮷", "吉"]);
    assert.equal(repository.glyphInput?.variantType, "HISTORICAL");
    assert.equal(
      repository.glyphInput?.segmentationCandidateId,
      "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
    );
    assert.equal(queue.job?.bboxWidth, 100);
  });

  it("previews the strict CSV template without creating glyph content", async () => {
    const repository = new MemoryContentAdminRepository();
    const service = new ContentAdminService(
      repository,
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    const csvText = `${service.contentImportTemplate()}53a3e68c-c38c-4b79-90b4-ab1212491184,𠮷,吉,𠮷、吉,HISTORICAL,"永和,九年",B_RUBBING_OR_AUTHORIZED_EDITION,20,30,100,120,75,60\r\n`;
    const result = await service.previewContentImport("editor@example.com", {
      csvText,
      fileName: "seed-glyphs.csv",
    });

    assert.equal(result.status, "READY");
    assert.equal(result.totalRows, 1);
    assert.equal(repository.glyphInput, null);
    assert.equal(repository.importRows[0]?.input?.observedCharacter, "𠮷");
    assert.equal(repository.importRows[0]?.input?.character, "吉");
    assert.equal(repository.importRows[0]?.input?.transcription, "永和,九年");
  });

  it("returns a row-level report for invalid CSV glyph data", async () => {
    const repository = new MemoryContentAdminRepository();
    const service = new ContentAdminService(
      repository,
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    const csvText = `${service.contentImportTemplate()}53a3e68c-c38c-4b79-90b4-ab1212491184,,吉,,,释文,B_RUBBING_OR_AUTHORIZED_EDITION,20,30,100,120,75,60\r\n`;
    const result = await service.previewContentImport("editor@example.com", {
      csvText,
      fileName: "invalid.csv",
    });

    assert.equal(result.status, "INVALID");
    assert.equal(result.invalidRows, 1);
    assert.match(result.rows[0]?.errors[0] ?? "", /原帖字/);
  });

  it("enqueues idempotent crop jobs only after a batch commit", async () => {
    const queue = new MemoryContentQueue();
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      queue,
      new MemoryCatalogInvalidator(),
    );
    const result = await service.commitContentImport(
      "editor@example.com",
      "53a3e68c-c38c-4b79-90b4-ab1212491184",
    );

    assert.equal(result.status, "COMMITTED");
    assert.equal(result.glyphCount, 1);
    assert.equal(queue.jobs.length, 1);
    assert.equal(
      queue.jobs[0]?.glyphId,
      "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
    );
  });

  it("rejects unknown rights states", () => {
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    assert.throws(
      () =>
        service.createRights("rights@example.com", {
          sourceName: "unknown",
          status: "PUBLIC",
        }),
      BadRequestException,
    );
  });

  it("queues a deterministic glyph crop and rejects AI attribution", async () => {
    const queue = new MemoryContentQueue();
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      queue,
      new MemoryCatalogInvalidator(),
    );
    const result = await service.createGlyph("editor@example.com", {
      authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
      bboxHeight: 500,
      bboxWidth: 400,
      bboxX: 10,
      bboxY: 20,
      character: "永",
      sourceAssetId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
    });
    assert.equal(result.status, "PROCESSING");
    assert.equal(queue.job?.bboxWidth, 400);
    assert.equal(
      queue.job?.outputObjectKey,
      "content/glyphs/53a3e68c-c38c-4b79-90b4-ab1212491184/glyph.webp",
    );
    await assert.rejects(() =>
      service.createGlyph("editor@example.com", {
        authenticityGrade: "D_AI_GENERATED",
        bboxHeight: 500,
        bboxWidth: 400,
        bboxX: 10,
        bboxY: 20,
        character: "永",
        sourceAssetId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
      }),
    );
  });

  it("requires a reason when review does not approve content", async () => {
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    await assert.rejects(
      () =>
        service.reviewGlyph(
          "reviewer@example.com",
          "53a3e68c-c38c-4b79-90b4-ab1212491184",
          { decision: "REJECTED" },
        ),
      BadRequestException,
    );
  });

  it("re-crops corrected bounds before returning to review", async () => {
    const queue = new MemoryContentQueue();
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      queue,
      new MemoryCatalogInvalidator(),
    );
    const result = await service.updateGlyph(
      "editor@example.com",
      "53a3e68c-c38c-4b79-90b4-ab1212491184",
      { bboxHeight: 420, bboxWidth: 320, bboxX: 30, bboxY: 40 },
    );
    assert.equal(result.status, "PROCESSING");
    assert.equal(queue.job?.bboxWidth, 320);
  });

  it("deletes public derivatives and invalidates cache when unpublishing", async () => {
    deletedPublicObjects.length = 0;
    const invalidator = new MemoryCatalogInvalidator();
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      new MemoryContentQueue(),
      invalidator,
    );
    const result = await service.unpublishGlyph(
      "rights@example.com",
      "53a3e68c-c38c-4b79-90b4-ab1212491184",
      { reason: "授权方要求撤下" },
    );
    assert.equal(result.status, "ARCHIVED");
    assert.deepEqual(deletedPublicObjects, [
      "content/glyphs/glyph-id/glyph.webp",
    ]);
    assert.equal(invalidator.count, 1);
  });

  it("cleans public derivatives and invalidates catalog after deactivation", async () => {
    deletedPublicObjects.length = 0;
    const invalidator = new MemoryCatalogInvalidator();
    const service = new ContentAdminService(
      new MemoryContentAdminRepository(),
      objectStorage,
      new MemoryContentQueue(),
      invalidator,
    );
    const result = await service.updateCalligrapher(
      "editor@example.com",
      "53a3e68c-c38c-4b79-90b4-ab1212491184",
      { isActive: false },
    );
    assert.equal(result.isActive, false);
    assert.deepEqual(deletedPublicObjects, [
      "content/glyphs/glyph-id/glyph.webp",
    ]);
    assert.equal(invalidator.count, 1);
  });

  it("shows field-level history differences and restores through normal editing", async () => {
    const repository = new MemoryContentAdminRepository();
    repository.historyAudit = {
      action: "UPDATE_CALLIGRAPHER",
      actorKey: "editor@example.com",
      createdAt: new Date("2026-07-18T00:00:00.000Z"),
      entityId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      entityType: "Calligrapher",
      id: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
      snapshot: {
        after: { dynasty: "唐", name: "欧阳询（修订）" },
        before: { dynasty: "唐", name: "欧阳询" },
      },
    };
    const service = new ContentAdminService(
      repository,
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    const history = await service.listContentHistory(
      "Calligrapher",
      "53a3e68c-c38c-4b79-90b4-ab1212491184",
    );
    assert.deepEqual(history[0]?.changes, [
      { after: "欧阳询（修订）", before: "欧阳询", field: "name" },
    ]);
    assert.equal(history[0]?.canRestore, true);

    await service.restoreContentHistory(
      "editor@example.com",
      ["EDITOR"],
      "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
    );
    assert.deepEqual(repository.calligrapherUpdateInput, {
      dynasty: "唐",
      name: "欧阳询",
    });
  });

  it("keeps rights history restoration behind the rights role", async () => {
    const repository = new MemoryContentAdminRepository();
    repository.historyAudit = {
      action: "UPDATE_RIGHTS",
      actorKey: "rights@example.com",
      createdAt: new Date("2026-07-18T00:00:00.000Z"),
      entityId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      entityType: "RightsRecord",
      id: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
      snapshot: {
        after: { status: "RESTRICTED" },
        before: { status: "CLEARED_PUBLIC" },
      },
    };
    const service = new ContentAdminService(
      repository,
      objectStorage,
      new MemoryContentQueue(),
      new MemoryCatalogInvalidator(),
    );
    await assert.rejects(
      () =>
        service.restoreContentHistory(
          "editor@example.com",
          ["EDITOR"],
          "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
        ),
      ForbiddenException,
    );
  });
});
