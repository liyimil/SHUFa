import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaContentAdminRepository } from "../src/admin/prisma-content-admin.repository.js";

describe("PrismaContentAdminRepository lifecycle", () => {
  it("rejects a checksum that already belongs to a source asset", async () => {
    let createCount = 0;
    const prisma = {
      contentSourceUploadSession: {
        create: () => {
          createCount += 1;
          return Promise.resolve({ id: "upload-id" });
        },
        findFirst: () => Promise.resolve(null),
      },
      rightsRecord: {
        findUnique: () => Promise.resolve({ id: "rights-id" }),
      },
      sourceAsset: {
        findUnique: () => Promise.resolve({ id: "source-id" }),
      },
      workEdition: {
        findFirst: () => Promise.resolve({ id: "edition-id" }),
      },
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const result = await repository.createSourceUpload("editor@example.com", {
      checksumSha256: "a".repeat(64),
      editionId: "edition-id",
      expiresAt: new Date("2026-07-18T00:15:00.000Z"),
      height: 2048,
      mimeType: "image/jpeg",
      now: new Date("2026-07-18T00:00:00.000Z"),
      objectKey: "content/sources/id/source.jpg",
      pageLabel: null,
      rightsRecordId: "rights-id",
      sizeBytes: 4096,
      width: 2048,
    });
    assert.deepEqual(result, {
      duplicateKind: "SOURCE_ASSET",
      status: "DUPLICATE",
    });
    assert.equal(createCount, 0);
  });

  it("rejects segmentation candidates outside the immutable source bounds", async () => {
    let mutationCount = 0;
    const transaction = {
      contentAudit: {
        create: () => {
          mutationCount += 1;
          return Promise.resolve({});
        },
      },
      contentSegmentationCandidate: {
        createMany: () => {
          mutationCount += 1;
          return Promise.resolve({ count: 1 });
        },
        deleteMany: () => {
          mutationCount += 1;
          return Promise.resolve({ count: 0 });
        },
      },
      contentSegmentationJob: {
        findUnique: () =>
          Promise.resolve({
            sourceAsset: { height: 600, width: 500 },
            status: "PROCESSING",
          }),
        update: () => {
          mutationCount += 1;
          return Promise.resolve({});
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const accepted = await repository.recordSegmentationResult(
      "job-id",
      "opencv-dilate-contours-v1",
      [
        {
          bboxHeight: 120,
          bboxWidth: 100,
          bboxX: 450,
          bboxY: 30,
          confidence: 800,
          sortOrder: 0,
        },
      ],
      new Date("2026-07-18T00:00:00.000Z"),
    );
    assert.equal(accepted, false);
    assert.equal(mutationCount, 0);
  });

  it("accepts a segmentation candidate and creates its variant glyph atomically", async () => {
    const auditActions: string[] = [];
    let candidateUpdate: Record<string, unknown> | null = null;
    let glyphCreate: Record<string, unknown> | null = null;
    let variantUpsert: Record<string, unknown> | null = null;
    let transactionCount = 0;
    const transaction = {
      character: {
        upsert: () => Promise.resolve({ id: "character-id" }),
      },
      characterVariant: {
        upsert: (input: Record<string, unknown>) => {
          variantUpsert = input;
          return Promise.resolve(input);
        },
      },
      contentAudit: {
        create: ({ data }: { data: { action: string } }) => {
          auditActions.push(data.action);
          return Promise.resolve(data);
        },
      },
      contentSegmentationCandidate: {
        findUnique: () =>
          Promise.resolve({
            job: { sourceAssetId: "source-id" },
            status: "PENDING",
          }),
        update: (input: Record<string, unknown>) => {
          candidateUpdate = input;
          return Promise.resolve(input);
        },
      },
      glyph: {
        create: (input: Record<string, unknown>) => {
          glyphCreate = input;
          return Promise.resolve({ id: "glyph-id" });
        },
      },
      sourceAsset: {
        findUnique: () =>
          Promise.resolve({
            edition: {
              isActive: true,
              work: { calligrapher: { isActive: true }, isActive: true },
            },
            height: 1200,
            mimeType: "image/jpeg",
            objectKey: "content/sources/source.jpg",
            width: 1000,
          }),
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) => {
        transactionCount += 1;
        return callback(transaction);
      },
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const result = await repository.createGlyph("editor@example.com", {
      authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
      bboxHeight: 320,
      bboxWidth: 260,
      bboxX: 120,
      bboxY: 180,
      beginnerWeight: 60,
      character: "吉",
      imageQuality: 75,
      labelCandidates: ["𠮷", "吉"],
      observedCharacter: "𠮷",
      segmentationCandidateId: "candidate-id",
      sourceAssetId: "source-id",
      transcription: "永和九年",
      unicodeCodePoint: "U+5409",
      variantType: "HISTORICAL",
    });

    assert.equal(transactionCount, 1);
    assert.deepEqual(result, {
      glyphId: "glyph-id",
      mimeType: "image/jpeg",
      sourceObjectKey: "content/sources/source.jpg",
    });
    assert.deepEqual((variantUpsert as { create: unknown } | null)?.create, {
      canonicalCharacterId: "character-id",
      type: "HISTORICAL",
      value: "𠮷",
    });
    assert.deepEqual(
      (
        glyphCreate as {
          data: { observedCharacter: string; transcription: string };
        } | null
      )?.data,
      {
        annotatedBy: "editor@example.com",
        authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
        bboxHeight: 320,
        bboxWidth: 260,
        bboxX: 120,
        bboxY: 180,
        beginnerWeight: 60,
        characterId: "character-id",
        contentStatus: "PROCESSING",
        imageQuality: 75,
        labelCandidates: ["𠮷", "吉"],
        observedCharacter: "𠮷",
        scriptStyle: "REGULAR",
        sourceAssetId: "source-id",
        transcription: "永和九年",
      },
    );
    const candidateData = (
      candidateUpdate as {
        data: {
          annotatedAt: Date;
          annotatedBy: string;
          glyphId: string;
          rejectionNote: null;
          status: string;
        };
      } | null
    )?.data;
    assert.ok(candidateData?.annotatedAt instanceof Date);
    assert.deepEqual(
      { ...candidateData, annotatedAt: undefined },
      {
        annotatedAt: undefined,
        annotatedBy: "editor@example.com",
        glyphId: "glyph-id",
        rejectionNote: null,
        status: "ACCEPTED",
      },
    );
    assert.deepEqual(auditActions, [
      "CREATE_GLYPH",
      "ACCEPT_SEGMENTATION_CANDIDATE",
    ]);
  });

  it("persists an invalid import report without writing glyph content", async () => {
    let glyphMutationCount = 0;
    let storedBatchData: Record<string, unknown> | null = null;
    const transaction = {
      contentAudit: { create: () => Promise.resolve({}) },
      contentImportBatch: {
        create: ({ data }: { data: Record<string, unknown> }) => {
          storedBatchData = data;
          const rows = (data.rows as { create: Array<Record<string, unknown>> })
            .create;
          return Promise.resolve({
            actorKey: data.actorKey,
            checksumSha256: data.checksumSha256,
            committedAt: null,
            createdAt: new Date("2026-07-18T00:00:00.000Z"),
            fileName: data.fileName,
            id: "batch-id",
            invalidRows: data.invalidRows,
            rows,
            status: data.status,
            totalRows: data.totalRows,
            validRows: data.validRows,
          });
        },
      },
      glyph: {
        createMany: () => {
          glyphMutationCount += 1;
          return Promise.resolve({ count: 1 });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      glyph: { findMany: () => Promise.resolve([]) },
      sourceAsset: { findMany: () => Promise.resolve([]) },
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const result = await repository.createContentImportBatch(
      "editor@example.com",
      {
        checksumSha256: "a".repeat(64),
        fileName: "seed.csv",
        rows: [
          {
            errors: [],
            input: {
              authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
              bboxHeight: 120,
              bboxWidth: 100,
              bboxX: 20,
              bboxY: 30,
              beginnerWeight: 60,
              character: "永",
              imageQuality: 75,
              labelCandidates: ["永"],
              observedCharacter: "永",
              segmentationCandidateId: null,
              sourceAssetId: "missing-source-id",
              transcription: null,
              unicodeCodePoint: "U+6C38",
              variantType: null,
            },
            rawData: { source_asset_id: "missing-source-id" },
            rowNumber: 2,
            targetGlyphId: "target-glyph-id",
          },
        ],
      },
    );

    assert.equal(result.status, "INVALID");
    assert.equal(result.invalidRows, 1);
    assert.match(result.rows[0]?.errors[0] ?? "", /来源资产/);
    assert.equal(glyphMutationCount, 0);
    assert.equal(
      (storedBatchData as { status?: string } | null)?.status,
      "INVALID",
    );
  });

  it("commits every validated import row as processing in one transaction", async () => {
    let transactionCount = 0;
    let glyphCreateData: Array<Record<string, unknown>> = [];
    let batchUpdate: Record<string, unknown> | null = null;
    const normalizedData = {
      authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
      bboxHeight: 120,
      bboxWidth: 100,
      bboxX: 20,
      bboxY: 30,
      beginnerWeight: 60,
      character: "吉",
      imageQuality: 75,
      labelCandidates: ["𠮷", "吉"],
      observedCharacter: "𠮷",
      segmentationCandidateId: null,
      sourceAssetId: "source-id",
      transcription: "释文",
      unicodeCodePoint: "U+5409",
      variantType: "HISTORICAL",
    };
    const transaction = {
      character: {
        createMany: () => Promise.resolve({ count: 1 }),
        findMany: () => Promise.resolve([{ id: "character-id", value: "吉" }]),
      },
      characterVariant: {
        createMany: () => Promise.resolve({ count: 1 }),
      },
      contentAudit: {
        createMany: () => Promise.resolve({ count: 2 }),
      },
      contentImportBatch: {
        findUnique: () =>
          Promise.resolve({
            actorKey: "editor@example.com",
            rows: [
              {
                normalizedData,
                targetGlyphId: "target-glyph-id",
              },
            ],
            status: "READY",
          }),
        update: (input: Record<string, unknown>) => {
          batchUpdate = input;
          return Promise.resolve(input);
        },
      },
      glyph: {
        createMany: ({ data }: { data: Array<Record<string, unknown>> }) => {
          glyphCreateData = data;
          return Promise.resolve({ count: data.length });
        },
        findFirst: () => Promise.resolve(null),
      },
      sourceAsset: {
        findMany: () =>
          Promise.resolve([
            {
              edition: {
                isActive: true,
                work: { calligrapher: { isActive: true }, isActive: true },
              },
              height: 1200,
              id: "source-id",
              mimeType: "image/jpeg",
              objectKey: "content/sources/source.jpg",
              width: 1000,
            },
          ]),
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) => {
        transactionCount += 1;
        return callback(transaction);
      },
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const result = await repository.commitContentImportBatch(
      "editor@example.com",
      "batch-id",
      new Date("2026-07-18T01:00:00.000Z"),
    );

    assert.equal(transactionCount, 1);
    assert.equal(glyphCreateData.length, 1);
    assert.equal(glyphCreateData[0]?.contentStatus, "PROCESSING");
    assert.notEqual(glyphCreateData[0]?.contentStatus, "PUBLISHED");
    assert.equal(glyphCreateData[0]?.id, "target-glyph-id");
    assert.deepEqual((batchUpdate as { data: unknown } | null)?.data, {
      committedAt: new Date("2026-07-18T01:00:00.000Z"),
      status: "COMMITTED",
    });
    assert.equal(result?.cropJobs[0]?.glyphId, "target-glyph-id");
  });

  it("does not let review bypass the published-content unpublish path", async () => {
    let transactionCount = 0;
    const prisma = {
      $transaction: () => {
        transactionCount += 1;
        return Promise.resolve([]);
      },
      contentAudit: {
        findFirst: () => Promise.resolve({ actorKey: "editor@example.com" }),
      },
      glyph: {
        findUnique: () =>
          Promise.resolve({ contentStatus: "PUBLISHED", id: "glyph-id" }),
      },
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const accepted = await repository.reviewGlyph(
      "reviewer@example.com",
      "glyph-id",
      "REJECTED",
      "内容有误",
    );
    assert.equal(accepted, false);
    assert.equal(transactionCount, 0);
  });

  it("archives a rejected review and records the transition", async () => {
    let glyphUpdate: Record<string, unknown> | null = null;
    let auditCreate: Record<string, unknown> | null = null;
    const prisma = {
      $transaction: (operations: unknown[]) => Promise.all(operations),
      contentAudit: {
        create: (input: Record<string, unknown>) => {
          auditCreate = input;
          return Promise.resolve(input);
        },
        findFirst: () => Promise.resolve({ actorKey: "editor@example.com" }),
      },
      contentReview: {
        create: (input: Record<string, unknown>) => Promise.resolve(input),
      },
      glyph: {
        findUnique: () =>
          Promise.resolve({ contentStatus: "NEEDS_REVIEW", id: "glyph-id" }),
        update: (input: Record<string, unknown>) => {
          glyphUpdate = input;
          return Promise.resolve(input);
        },
      },
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const accepted = await repository.reviewGlyph(
      "reviewer@example.com",
      "glyph-id",
      "REJECTED",
      "字形标注错误",
    );
    assert.equal(accepted, true);
    assert.deepEqual((glyphUpdate as { data: unknown } | null)?.data, {
      contentStatus: "ARCHIVED",
    });
    assert.deepEqual(
      (auditCreate as { data: { snapshot: unknown } } | null)?.data.snapshot,
      {
        decision: "REJECTED",
        nextStatus: "ARCHIVED",
        note: "字形标注错误",
        previousStatus: "NEEDS_REVIEW",
      },
    );
  });

  it("returns every public derivative while auditing unpublish reason", async () => {
    let auditCreate: Record<string, unknown> | null = null;
    let glyphUpdate: Record<string, unknown> | null = null;
    const prisma = {
      $transaction: (operations: unknown[]) => Promise.all(operations),
      contentAudit: {
        create: (input: Record<string, unknown>) => {
          auditCreate = input;
          return Promise.resolve(input);
        },
      },
      glyph: {
        findUnique: () =>
          Promise.resolve({
            assets: [
              { objectKey: "content/glyphs/id/glyph.webp" },
              { objectKey: "content/glyphs/id/thumb.webp" },
            ],
            contentStatus: "PUBLISHED",
          }),
        update: (input: Record<string, unknown>) => {
          glyphUpdate = input;
          return Promise.resolve(input);
        },
      },
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const result = await repository.unpublishGlyph(
      "rights@example.com",
      "glyph-id",
      "授权到期",
    );
    assert.deepEqual(result?.objectKeys, [
      "content/glyphs/id/glyph.webp",
      "content/glyphs/id/thumb.webp",
    ]);
    assert.deepEqual((glyphUpdate as { data: unknown } | null)?.data, {
      contentStatus: "ARCHIVED",
    });
    assert.deepEqual(
      (auditCreate as { data: { snapshot: unknown } } | null)?.data.snapshot,
      { previousStatus: "PUBLISHED", reason: "授权到期" },
    );
  });

  it("invalidates approval and requests a new crop after bounds correction", async () => {
    let glyphUpdate: Record<string, unknown> | null = null;
    let auditCreate: Record<string, unknown> | null = null;
    const transaction = {
      character: {
        upsert: () => Promise.resolve({ id: "character-id" }),
      },
      contentAudit: {
        create: (input: Record<string, unknown>) => {
          auditCreate = input;
          return Promise.resolve(input);
        },
      },
      glyph: {
        findUnique: () =>
          Promise.resolve({
            authenticityGrade: "B_RUBBING_OR_AUTHORIZED_EDITION",
            bboxHeight: 300,
            bboxWidth: 250,
            bboxX: 10,
            bboxY: 20,
            beginnerWeight: 50,
            character: { id: "character-id", value: "永" },
            contentStatus: "APPROVED",
            imageQuality: 80,
            publishedAt: null,
            sourceAsset: {
              height: 1000,
              mimeType: "image/jpeg",
              objectKey: "content/sources/source.jpg",
              width: 1000,
            },
          }),
        update: (input: Record<string, unknown>) => {
          glyphUpdate = input;
          return Promise.resolve(input);
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const result = await repository.updateGlyph("editor@example.com", "id", {
      bboxHeight: 320,
      bboxWidth: 270,
    });
    assert.equal(result?.status, "PROCESSING");
    assert.equal(result?.cropJob?.bboxWidth, 270);
    assert.equal(
      (glyphUpdate as { data: { contentStatus: string } } | null)?.data
        .contentStatus,
      "PROCESSING",
    );
    assert.equal(
      (auditCreate as { data: { action: string } } | null)?.data.action,
      "UPDATE_GLYPH",
    );
  });

  it("archives published descendants when a calligrapher is deactivated", async () => {
    const auditActions: string[] = [];
    let archivedIds: string[] = [];
    const transaction = {
      calligrapher: {
        findUnique: () =>
          Promise.resolve({
            biography: null,
            dynasty: "唐",
            id: "calligrapher-id",
            isActive: true,
            name: "欧阳询",
          }),
        update: ({ data }: { data: { isActive?: boolean } }) =>
          Promise.resolve({
            biography: null,
            dynasty: "唐",
            id: "calligrapher-id",
            isActive: data.isActive ?? true,
            name: "欧阳询",
          }),
      },
      contentAudit: {
        create: ({ data }: { data: { action: string } }) => {
          auditActions.push(data.action);
          return Promise.resolve(data);
        },
        createMany: ({ data }: { data: Array<{ action: string }> }) => {
          auditActions.push(...data.map(({ action }) => action));
          return Promise.resolve({ count: data.length });
        },
      },
      glyph: {
        findMany: () =>
          Promise.resolve([
            {
              assets: [
                { objectKey: "content/glyphs/one/glyph.webp", width: 800 },
              ],
              contentStatus: "PUBLISHED",
              id: "glyph-one",
            },
            {
              assets: [
                { objectKey: "content/glyphs/retry/glyph.webp", width: 800 },
              ],
              contentStatus: "ARCHIVED",
              id: "glyph-retry",
            },
          ]),
        updateMany: ({ where }: { where: { id: { in: string[] } } }) => {
          archivedIds = where.id.in;
          return Promise.resolve({ count: archivedIds.length });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const result = await repository.updateCalligrapher(
      "editor@example.com",
      "calligrapher-id",
      { isActive: false },
    );
    assert.deepEqual(archivedIds, ["glyph-one"]);
    assert.deepEqual(result?.archivedObjectKeys, [
      "content/glyphs/one/glyph.webp",
      "content/glyphs/retry/glyph.webp",
    ]);
    assert.deepEqual(auditActions, ["UPDATE_CALLIGRAPHER", "UNPUBLISH_GLYPH"]);
  });

  it("archives only derivatives that exceed revised rights constraints", async () => {
    let archivedIds: string[] = [];
    const transaction = {
      contentAudit: {
        create: ({ data }: { data: unknown }) => Promise.resolve(data),
        createMany: ({ data }: { data: unknown[] }) =>
          Promise.resolve({ count: data.length }),
      },
      glyph: {
        findMany: () =>
          Promise.resolve([
            {
              assets: [{ objectKey: "wide.webp", width: 1200 }],
              contentStatus: "PUBLISHED",
              id: "wide",
            },
            {
              assets: [{ objectKey: "small.webp", width: 600 }],
              contentStatus: "PUBLISHED",
              id: "small",
            },
          ]),
        updateMany: ({ where }: { where: { id: { in: string[] } } }) => {
          archivedIds = where.id.in;
          return Promise.resolve({ count: archivedIds.length });
        },
      },
      rightsRecord: {
        findUnique: () =>
          Promise.resolve({
            allowCommercial: false,
            attributionText: null,
            id: "rights-id",
            licenseName: null,
            maxPublicWidth: null,
            notes: null,
            sourceName: "馆藏",
            sourceUrl: null,
            status: "CLEARED_PUBLIC",
            validFrom: null,
            validUntil: null,
          }),
        update: () =>
          Promise.resolve({
            allowCommercial: false,
            attributionText: null,
            id: "rights-id",
            licenseName: null,
            maxPublicWidth: 800,
            notes: null,
            sourceName: "馆藏",
            sourceUrl: null,
            status: "CLEARED_PUBLIC",
            validFrom: null,
            validUntil: null,
          }),
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaContentAdminRepository(prisma as never);
    const result = await repository.updateRights(
      "rights@example.com",
      "rights-id",
      { maxPublicWidth: 800 },
      new Date("2026-07-18T00:00:00.000Z"),
    );
    assert.deepEqual(archivedIds, ["wide"]);
    assert.deepEqual(result?.archivedObjectKeys, ["wide.webp"]);
  });
});
