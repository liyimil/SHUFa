import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { ContentAdminRepository } from "./content-admin.repository.js";
import type {
  AdminContentImportBatch,
  ContentImportCommitResult,
  ContentImportPreparedRow,
  CreateCalligrapherInput,
  ContentHistoryEntityType,
  CreateEditionInput,
  CreateGlyphInput,
  CreateRightsInput,
  CreateSourceUploadInput,
  CreateWorkInput,
  GlyphCorrectionResult,
  PendingSourceUpload,
  SegmentationCandidateInput,
  UpdateCalligrapherInput,
  UpdateEditionInput,
  UpdateGlyphInput,
  UpdateRightsInput,
  UpdateWorkInput,
} from "./content-admin.types.js";

type PublishedGlyphForArchive = {
  assets: Array<{ objectKey: string; width: number }>;
  contentStatus: string;
  id: string;
};

function asAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function importCoordinateKey(input: CreateGlyphInput): string {
  return [
    input.sourceAssetId,
    input.bboxX,
    input.bboxY,
    input.bboxWidth,
    input.bboxHeight,
  ].join(":");
}

function mapImportBatch(batch: {
  actorKey: string;
  checksumSha256: string;
  committedAt: Date | null;
  createdAt: Date;
  fileName: string;
  id: string;
  invalidRows: number;
  rows: Array<{
    normalizedData: unknown;
    rawData: unknown;
    rowNumber: number;
    targetGlyphId: string | null;
    validationErrors: unknown;
  }>;
  status: "INVALID" | "READY" | "COMMITTED";
  totalRows: number;
  validRows: number;
}): AdminContentImportBatch {
  return {
    ...batch,
    rows: batch.rows.map((row) => ({
      errors: Array.isArray(row.validationErrors)
        ? row.validationErrors.map(String)
        : [],
      normalizedData: row.normalizedData as CreateGlyphInput | null,
      rawData: row.rawData as Record<string, string>,
      rowNumber: row.rowNumber,
      targetGlyphId: row.targetGlyphId,
    })),
  };
}

@Injectable()
export class PrismaContentAdminRepository implements ContentAdminRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createContentImportBatch(
    actorKey: string,
    input: {
      checksumSha256: string;
      fileName: string;
      rows: ContentImportPreparedRow[];
    },
  ) {
    const normalizedRows = input.rows.filter(
      (row): row is ContentImportPreparedRow & { input: CreateGlyphInput } =>
        row.input !== null,
    );
    const sourceIds = [
      ...new Set(normalizedRows.map((row) => row.input.sourceAssetId)),
    ];
    const [sources, existingGlyphs] = await Promise.all([
      this.prisma.sourceAsset.findMany({
        where: { id: { in: sourceIds } },
        select: {
          edition: {
            select: {
              isActive: true,
              work: {
                select: {
                  calligrapher: { select: { isActive: true } },
                  isActive: true,
                },
              },
            },
          },
          height: true,
          id: true,
          width: true,
        },
      }),
      normalizedRows.length === 0
        ? Promise.resolve([])
        : this.prisma.glyph.findMany({
            where: {
              OR: normalizedRows.map(({ input: glyph }) => ({
                bboxHeight: glyph.bboxHeight,
                bboxWidth: glyph.bboxWidth,
                bboxX: glyph.bboxX,
                bboxY: glyph.bboxY,
                sourceAssetId: glyph.sourceAssetId,
              })),
            },
            select: {
              bboxHeight: true,
              bboxWidth: true,
              bboxX: true,
              bboxY: true,
              sourceAssetId: true,
            },
          }),
    ]);
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    const existingKeys = new Set(
      existingGlyphs.map((glyph) =>
        importCoordinateKey({ ...glyph } as CreateGlyphInput),
      ),
    );
    const rowKeyCounts = new Map<string, number>();
    for (const row of normalizedRows) {
      const key = importCoordinateKey(row.input);
      rowKeyCounts.set(key, (rowKeyCounts.get(key) ?? 0) + 1);
    }
    const checkedRows = input.rows.map((row) => {
      const errors = [...row.errors];
      if (row.input) {
        const source = sourcesById.get(row.input.sourceAssetId);
        if (
          !source ||
          !source.edition.isActive ||
          !source.edition.work.isActive ||
          !source.edition.work.calligrapher.isActive
        ) {
          errors.push("来源资产不存在或其书家、作品、版本已停用。");
        } else if (
          row.input.bboxX + row.input.bboxWidth > source.width ||
          row.input.bboxY + row.input.bboxHeight > source.height
        ) {
          errors.push("单字框超出原帖像素边界。");
        }
        const key = importCoordinateKey(row.input);
        if ((rowKeyCounts.get(key) ?? 0) > 1) {
          errors.push("同一导入文件中存在重复的来源与单字框。");
        }
        if (existingKeys.has(key)) {
          errors.push("该来源与单字框已经存在于内容库中。");
        }
      }
      return { ...row, errors };
    });
    const invalidRows = checkedRows.filter(
      (row) => row.errors.length > 0,
    ).length;
    const created = await this.prisma.$transaction(async (transaction) => {
      const batch = await transaction.contentImportBatch.create({
        data: {
          actorKey,
          checksumSha256: input.checksumSha256,
          fileName: input.fileName,
          invalidRows,
          rows: {
            create: checkedRows.map((row) => ({
              normalizedData: row.input ? asAuditJson(row.input) : undefined,
              rawData: asAuditJson(row.rawData),
              rowNumber: row.rowNumber,
              targetGlyphId: row.errors.length === 0 ? row.targetGlyphId : null,
              validationErrors: asAuditJson(row.errors),
            })),
          },
          status: invalidRows === 0 ? "READY" : "INVALID",
          totalRows: checkedRows.length,
          validRows: checkedRows.length - invalidRows,
        },
        include: { rows: { orderBy: { rowNumber: "asc" } } },
      });
      await transaction.contentAudit.create({
        data: {
          action: "CREATE_IMPORT_BATCH",
          actorKey,
          entityId: batch.id,
          entityType: "ContentImportBatch",
          snapshot: {
            checksumSha256: input.checksumSha256,
            fileName: input.fileName,
            invalidRows,
            totalRows: checkedRows.length,
          },
        },
      });
      return batch;
    });
    return mapImportBatch(created);
  }

  async listContentImportBatches() {
    const batches = await this.prisma.contentImportBatch.findMany({
      include: { rows: { orderBy: { rowNumber: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return batches.map(mapImportBatch);
  }

  commitContentImportBatch(
    actorKey: string,
    batchId: string,
    now: Date,
  ): Promise<ContentImportCommitResult | null> {
    return this.prisma.$transaction(async (transaction) => {
      const batch = await transaction.contentImportBatch.findUnique({
        where: { id: batchId },
        include: { rows: { orderBy: { rowNumber: "asc" } } },
      });
      if (!batch || batch.status === "INVALID") {
        return null;
      }
      const rows = batch.rows.map((row) => ({
        glyphId: row.targetGlyphId,
        input: row.normalizedData as unknown as CreateGlyphInput,
      }));
      if (rows.some((row) => !row.glyphId || !row.input)) return null;
      const glyphIds = rows.map((row) => row.glyphId as string);
      if (batch.status === "COMMITTED") {
        const pendingGlyphs = await transaction.glyph.findMany({
          where: { contentStatus: "PROCESSING", id: { in: glyphIds } },
          select: {
            bboxHeight: true,
            bboxWidth: true,
            bboxX: true,
            bboxY: true,
            id: true,
            sourceAsset: { select: { mimeType: true, objectKey: true } },
          },
        });
        return {
          batchId,
          cropJobs: pendingGlyphs.map((glyph) => ({
            bboxHeight: glyph.bboxHeight,
            bboxWidth: glyph.bboxWidth,
            bboxX: glyph.bboxX,
            bboxY: glyph.bboxY,
            glyphId: glyph.id,
            mimeType: glyph.sourceAsset.mimeType,
            outputObjectKey: `content/glyphs/${glyph.id}/glyph.webp`,
            sourceObjectKey: glyph.sourceAsset.objectKey,
          })),
          glyphCount: glyphIds.length,
          status: "COMMITTED",
        };
      }
      const sourceIds = [
        ...new Set(rows.map((row) => row.input.sourceAssetId)),
      ];
      const sources = await transaction.sourceAsset.findMany({
        where: { id: { in: sourceIds } },
        select: {
          edition: {
            select: {
              isActive: true,
              work: {
                select: {
                  calligrapher: { select: { isActive: true } },
                  isActive: true,
                },
              },
            },
          },
          height: true,
          id: true,
          mimeType: true,
          objectKey: true,
          width: true,
        },
      });
      const sourcesById = new Map(sources.map((source) => [source.id, source]));
      if (
        rows.some(({ input }) => {
          const source = sourcesById.get(input.sourceAssetId);
          return (
            !source ||
            !source.edition.isActive ||
            !source.edition.work.isActive ||
            !source.edition.work.calligrapher.isActive ||
            input.bboxX + input.bboxWidth > source.width ||
            input.bboxY + input.bboxHeight > source.height
          );
        })
      ) {
        return null;
      }
      const existing = await transaction.glyph.findFirst({
        where: {
          OR: rows.map(({ input }) => ({
            bboxHeight: input.bboxHeight,
            bboxWidth: input.bboxWidth,
            bboxX: input.bboxX,
            bboxY: input.bboxY,
            sourceAssetId: input.sourceAssetId,
          })),
        },
        select: { id: true },
      });
      if (existing) return null;
      const characters = [
        ...new Map(rows.map(({ input }) => [input.character, input])).values(),
      ];
      await transaction.character.createMany({
        data: characters.map((input) => ({
          unicodeCodePoint: input.unicodeCodePoint,
          value: input.character,
        })),
        skipDuplicates: true,
      });
      const storedCharacters = await transaction.character.findMany({
        where: { value: { in: characters.map((input) => input.character) } },
        select: { id: true, value: true },
      });
      const characterIds = new Map(
        storedCharacters.map((character) => [character.value, character.id]),
      );
      if (characterIds.size !== characters.length) return null;
      const variants = rows.flatMap(({ input }) => {
        const canonicalCharacterId = characterIds.get(input.character);
        return input.observedCharacter !== input.character &&
          input.variantType &&
          canonicalCharacterId
          ? [
              {
                canonicalCharacterId,
                type: input.variantType,
                value: input.observedCharacter,
              },
            ]
          : [];
      });
      if (variants.length > 0) {
        await transaction.characterVariant.createMany({
          data: variants,
          skipDuplicates: true,
        });
      }
      await transaction.glyph.createMany({
        data: rows.map(({ glyphId, input }) => ({
          annotatedBy: actorKey,
          authenticityGrade: input.authenticityGrade,
          bboxHeight: input.bboxHeight,
          bboxWidth: input.bboxWidth,
          bboxX: input.bboxX,
          bboxY: input.bboxY,
          beginnerWeight: input.beginnerWeight,
          characterId: characterIds.get(input.character) as string,
          contentStatus: "PROCESSING" as const,
          id: glyphId as string,
          imageQuality: input.imageQuality,
          labelCandidates: input.labelCandidates,
          observedCharacter: input.observedCharacter,
          scriptStyle: "REGULAR" as const,
          sourceAssetId: input.sourceAssetId,
          transcription: input.transcription,
        })),
      });
      await transaction.contentAudit.createMany({
        data: [
          {
            action: "COMMIT_IMPORT_BATCH" as const,
            actorKey,
            entityId: batchId,
            entityType: "ContentImportBatch",
            snapshot: { glyphCount: rows.length },
          },
          ...rows.map(({ glyphId, input }) => ({
            action: "CREATE_GLYPH" as const,
            actorKey,
            entityId: glyphId as string,
            entityType: "Glyph",
            snapshot: asAuditJson({ ...input, importBatchId: batchId }),
          })),
        ],
      });
      await transaction.contentImportBatch.update({
        data: { committedAt: now, status: "COMMITTED" },
        where: { id: batchId, status: "READY" },
      });
      return {
        batchId,
        cropJobs: rows.map(({ glyphId, input }) => {
          const source = sourcesById.get(
            input.sourceAssetId,
          ) as (typeof sources)[number];
          return {
            bboxHeight: input.bboxHeight,
            bboxWidth: input.bboxWidth,
            bboxX: input.bboxX,
            bboxY: input.bboxY,
            glyphId: glyphId as string,
            mimeType: source.mimeType,
            outputObjectKey: `content/glyphs/${glyphId}/glyph.webp`,
            sourceObjectKey: source.objectKey,
          };
        }),
        glyphCount: rows.length,
        status: "COMMITTED",
      };
    });
  }

  private async archivePublishedGlyphs(
    transaction: Prisma.TransactionClient,
    glyphs: PublishedGlyphForArchive[],
    actorKey: string,
    reason: string,
  ): Promise<string[]> {
    if (glyphs.length === 0) return [];
    const publishedGlyphIds = glyphs
      .filter(({ contentStatus }) => contentStatus === "PUBLISHED")
      .map(({ id }) => id);
    if (publishedGlyphIds.length > 0) {
      await transaction.glyph.updateMany({
        data: { contentStatus: "ARCHIVED" },
        where: { id: { in: publishedGlyphIds }, contentStatus: "PUBLISHED" },
      });
      await transaction.contentAudit.createMany({
        data: publishedGlyphIds.map((glyphId) => ({
          action: "UNPUBLISH_GLYPH" as const,
          actorKey,
          entityId: glyphId,
          entityType: "Glyph",
          snapshot: { previousStatus: "PUBLISHED", reason },
        })),
      });
    }
    return [
      ...new Set(
        glyphs.flatMap(({ assets }) =>
          assets.map(({ objectKey }) => objectKey),
        ),
      ),
    ];
  }

  listCalligraphers() {
    return this.prisma.calligrapher.findMany({
      orderBy: [{ dynasty: "asc" }, { name: "asc" }],
      select: {
        biography: true,
        dynasty: true,
        id: true,
        isActive: true,
        name: true,
      },
    });
  }

  listWorks() {
    return this.prisma.work.findMany({
      orderBy: [{ dynasty: "asc" }, { title: "asc" }],
      select: {
        calligrapher: { select: { id: true, isActive: true, name: true } },
        description: true,
        dynasty: true,
        id: true,
        isActive: true,
        title: true,
      },
    });
  }

  listEditions() {
    return this.prisma.workEdition.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        holdingInstitution: true,
        id: true,
        isActive: true,
        name: true,
        publication: true,
        sourceUrl: true,
        work: {
          select: {
            calligrapher: { select: { isActive: true } },
            id: true,
            isActive: true,
            title: true,
          },
        },
      },
    });
  }

  listRights() {
    return this.prisma.rightsRecord.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: {
        allowCommercial: true,
        attributionText: true,
        id: true,
        licenseName: true,
        maxPublicWidth: true,
        notes: true,
        sourceName: true,
        sourceUrl: true,
        status: true,
        validFrom: true,
        validUntil: true,
      },
    });
  }

  listContentHistory(entityType: ContentHistoryEntityType, entityId: string) {
    return this.prisma.contentAudit.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      where: { entityId, entityType },
      select: {
        action: true,
        actorKey: true,
        createdAt: true,
        entityId: true,
        entityType: true,
        id: true,
        snapshot: true,
      },
    });
  }

  findContentHistory(auditId: string) {
    return this.prisma.contentAudit.findUnique({
      where: { id: auditId },
      select: {
        action: true,
        actorKey: true,
        createdAt: true,
        entityId: true,
        entityType: true,
        id: true,
        snapshot: true,
      },
    });
  }

  async createSourceUpload(
    actorKey: string,
    input: CreateSourceUploadInput & {
      expiresAt: Date;
      now: Date;
      objectKey: string;
    },
  ) {
    const { now, ...createInput } = input;
    const [edition, rights, existingAsset, activeUpload] = await Promise.all([
      this.prisma.workEdition.findFirst({
        where: {
          id: input.editionId,
          isActive: true,
          work: { isActive: true, calligrapher: { isActive: true } },
        },
        select: { id: true },
      }),
      this.prisma.rightsRecord.findUnique({
        where: { id: input.rightsRecordId },
        select: { id: true },
      }),
      this.prisma.sourceAsset.findUnique({
        where: { checksumSha256: input.checksumSha256 },
        select: { id: true },
      }),
      this.prisma.contentSourceUploadSession.findFirst({
        where: {
          checksumSha256: input.checksumSha256,
          completedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      }),
    ]);
    if (!edition || !rights) return null;
    if (existingAsset) {
      return {
        duplicateKind: "SOURCE_ASSET" as const,
        status: "DUPLICATE" as const,
      };
    }
    if (activeUpload) {
      return {
        duplicateKind: "ACTIVE_UPLOAD" as const,
        status: "DUPLICATE" as const,
      };
    }
    return this.prisma.contentSourceUploadSession
      .create({
        data: { actorKey, ...createInput },
        select: { id: true },
      })
      .then(({ id }) => ({ status: "CREATED" as const, uploadId: id }));
  }

  async findSourceUpload(uploadId: string, actorKey: string) {
    return this.prisma.contentSourceUploadSession.findFirst({
      where: { actorKey, id: uploadId },
      select: {
        actorKey: true,
        checksumSha256: true,
        editionId: true,
        expiresAt: true,
        height: true,
        id: true,
        mimeType: true,
        objectKey: true,
        pageLabel: true,
        rightsRecordId: true,
        sizeBytes: true,
        sourceAssetId: true,
        width: true,
      },
    }) as Promise<PendingSourceUpload | null>;
  }

  completeSourceUpload(uploadId: string, actorKey: string, completedAt: Date) {
    return this.prisma.$transaction(async (transaction) => {
      const session =
        await transaction.contentSourceUploadSession.findFirstOrThrow({
          where: { actorKey, id: uploadId },
        });
      if (session.sourceAssetId) {
        return { sourceAssetId: session.sourceAssetId };
      }
      const sourceAsset = await transaction.sourceAsset.create({
        data: {
          checksumSha256: session.checksumSha256,
          editionId: session.editionId,
          height: session.height,
          mimeType: session.mimeType,
          objectKey: session.objectKey,
          pageLabel: session.pageLabel,
          rightsRecordId: session.rightsRecordId,
          width: session.width,
        },
        select: { id: true },
      });
      await transaction.contentSourceUploadSession.update({
        data: { completedAt, sourceAssetId: sourceAsset.id },
        where: { id: uploadId },
      });
      await transaction.contentAudit.create({
        data: {
          action: "CREATE_SOURCE_ASSET",
          actorKey,
          entityId: sourceAsset.id,
          entityType: "SourceAsset",
          snapshot: {
            checksumSha256: session.checksumSha256,
            editionId: session.editionId,
            objectKey: session.objectKey,
            rightsRecordId: session.rightsRecordId,
          },
        },
      });
      return { sourceAssetId: sourceAsset.id };
    });
  }

  listSourceAssets() {
    return this.prisma.sourceAsset.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        edition: {
          select: { name: true, work: { select: { title: true } } },
        },
        height: true,
        id: true,
        pageLabel: true,
        width: true,
      },
    });
  }

  listSegmentationJobs() {
    return this.prisma.contentSegmentationJob.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: {
        algorithmVersion: true,
        candidates: {
          orderBy: { sortOrder: "asc" },
          select: {
            annotatedAt: true,
            annotatedBy: true,
            bboxHeight: true,
            bboxWidth: true,
            bboxX: true,
            bboxY: true,
            confidence: true,
            glyphId: true,
            id: true,
            rejectionNote: true,
            sortOrder: true,
            status: true,
          },
        },
        completedAt: true,
        createdAt: true,
        failureCode: true,
        failureMessage: true,
        id: true,
        requestedBy: true,
        sourceAsset: {
          select: {
            edition: {
              select: { name: true, work: { select: { title: true } } },
            },
            height: true,
            id: true,
            pageLabel: true,
            width: true,
          },
        },
        startedAt: true,
        status: true,
      },
    });
  }

  createSegmentationJob(actorKey: string, sourceAssetId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const source = await transaction.sourceAsset.findFirst({
        where: {
          id: sourceAssetId,
          edition: {
            isActive: true,
            work: { isActive: true, calligrapher: { isActive: true } },
          },
        },
        select: { id: true, mimeType: true, objectKey: true },
      });
      if (!source) return null;
      const existing = await transaction.contentSegmentationJob.findUnique({
        where: { activeKey: sourceAssetId },
        select: { id: true, status: true },
      });
      if (existing) {
        return {
          created: false,
          jobId: existing.id,
          mimeType: source.mimeType,
          sourceObjectKey: source.objectKey,
          status: existing.status as "PENDING" | "PROCESSING",
        };
      }
      const job = await transaction.contentSegmentationJob.create({
        data: {
          activeKey: sourceAssetId,
          requestedBy: actorKey,
          sourceAssetId,
        },
        select: { id: true, status: true },
      });
      await transaction.contentAudit.create({
        data: {
          action: "CREATE_SEGMENTATION_JOB",
          actorKey,
          entityId: job.id,
          entityType: "ContentSegmentationJob",
          snapshot: { sourceAssetId },
        },
      });
      return {
        created: true,
        jobId: job.id,
        mimeType: source.mimeType,
        sourceObjectKey: source.objectKey,
        status: "PENDING" as const,
      };
    });
  }

  async markSegmentationProcessing(jobId: string, now: Date) {
    const result = await this.prisma.contentSegmentationJob.updateMany({
      data: {
        failureCode: null,
        failureMessage: null,
        startedAt: now,
        status: "PROCESSING",
      },
      where: { id: jobId, status: { in: ["PENDING", "PROCESSING"] } },
    });
    if (result.count > 0) return true;
    return Boolean(
      await this.prisma.contentSegmentationJob.findFirst({
        where: { id: jobId, status: "COMPLETED" },
        select: { id: true },
      }),
    );
  }

  recordSegmentationResult(
    jobId: string,
    algorithmVersion: string,
    candidates: SegmentationCandidateInput[],
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const job = await transaction.contentSegmentationJob.findUnique({
        where: { id: jobId },
        select: {
          sourceAsset: { select: { height: true, width: true } },
          status: true,
        },
      });
      if (!job) return false;
      if (job.status === "COMPLETED") return true;
      if (
        candidates.some(
          (candidate) =>
            candidate.bboxX < 0 ||
            candidate.bboxY < 0 ||
            candidate.bboxWidth <= 0 ||
            candidate.bboxHeight <= 0 ||
            candidate.bboxX + candidate.bboxWidth > job.sourceAsset.width ||
            candidate.bboxY + candidate.bboxHeight > job.sourceAsset.height ||
            candidate.confidence < 0 ||
            candidate.confidence > 1_000,
        )
      ) {
        return false;
      }
      await transaction.contentSegmentationCandidate.deleteMany({
        where: { jobId },
      });
      if (candidates.length > 0) {
        await transaction.contentSegmentationCandidate.createMany({
          data: candidates.map((candidate) => ({ ...candidate, jobId })),
        });
      }
      await transaction.contentSegmentationJob.update({
        data: {
          activeKey: null,
          algorithmVersion,
          completedAt: now,
          failureCode: null,
          failureMessage: null,
          status: "COMPLETED",
        },
        where: { id: jobId },
      });
      await transaction.contentAudit.create({
        data: {
          action: "COMPLETE_SEGMENTATION_JOB",
          actorKey: "worker:content-segmentation",
          entityId: jobId,
          entityType: "ContentSegmentationJob",
          snapshot: { algorithmVersion, candidateCount: candidates.length },
        },
      });
      return true;
    });
  }

  recordSegmentationFailure(
    jobId: string,
    failureCode: string,
    failureMessage: string,
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const job = await transaction.contentSegmentationJob.findUnique({
        where: { id: jobId },
        select: { id: true, status: true },
      });
      if (!job) return false;
      if (job.status === "COMPLETED") return true;
      await transaction.contentSegmentationJob.update({
        data: {
          activeKey: null,
          completedAt: now,
          failureCode,
          failureMessage,
          status: "FAILED",
        },
        where: { id: jobId },
      });
      await transaction.contentAudit.create({
        data: {
          action: "FAIL_SEGMENTATION_JOB",
          actorKey: "worker:content-segmentation",
          entityId: jobId,
          entityType: "ContentSegmentationJob",
          snapshot: { failureCode, failureMessage },
        },
      });
      return true;
    });
  }

  listGlyphs() {
    return this.prisma.glyph.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        authenticityGrade: true,
        bboxHeight: true,
        bboxWidth: true,
        bboxX: true,
        bboxY: true,
        beginnerWeight: true,
        character: { select: { value: true } },
        contentStatus: true,
        id: true,
        imageQuality: true,
        labelCandidates: true,
        observedCharacter: true,
        annotatedBy: true,
        sourceAsset: {
          select: {
            edition: { select: { work: { select: { title: true } } } },
          },
        },
        transcription: true,
      },
    });
  }

  findPrivateSourceAsset(sourceAssetId: string) {
    return this.prisma.sourceAsset.findFirst({
      where: {
        id: sourceAssetId,
        edition: {
          isActive: true,
          work: { isActive: true, calligrapher: { isActive: true } },
        },
      },
      select: {
        height: true,
        mimeType: true,
        objectKey: true,
        width: true,
      },
    });
  }

  findSegmentationCandidate(candidateId: string) {
    return this.prisma.contentSegmentationCandidate
      .findUnique({
        where: { id: candidateId },
        select: {
          bboxHeight: true,
          bboxWidth: true,
          bboxX: true,
          bboxY: true,
          id: true,
          job: { select: { sourceAssetId: true } },
          status: true,
        },
      })
      .then((candidate) =>
        candidate
          ? {
              bboxHeight: candidate.bboxHeight,
              bboxWidth: candidate.bboxWidth,
              bboxX: candidate.bboxX,
              bboxY: candidate.bboxY,
              id: candidate.id,
              sourceAssetId: candidate.job.sourceAssetId,
              status: candidate.status,
            }
          : null,
      );
  }

  rejectSegmentationCandidate(
    actorKey: string,
    candidateId: string,
    note: string,
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const candidate =
        await transaction.contentSegmentationCandidate.findUnique({
          where: { id: candidateId },
          select: { status: true },
        });
      if (!candidate || candidate.status === "ACCEPTED") return false;
      if (candidate.status === "REJECTED") return true;
      await transaction.contentSegmentationCandidate.update({
        data: {
          annotatedAt: now,
          annotatedBy: actorKey,
          rejectionNote: note,
          status: "REJECTED",
        },
        where: { id: candidateId },
      });
      await transaction.contentAudit.create({
        data: {
          action: "REJECT_SEGMENTATION_CANDIDATE",
          actorKey,
          entityId: candidateId,
          entityType: "ContentSegmentationCandidate",
          snapshot: { note },
        },
      });
      return true;
    });
  }

  createGlyph(actorKey: string, input: CreateGlyphInput) {
    return this.prisma.$transaction(async (transaction) => {
      const segmentationCandidate = input.segmentationCandidateId
        ? await transaction.contentSegmentationCandidate.findUnique({
            where: { id: input.segmentationCandidateId },
            select: {
              job: { select: { sourceAssetId: true } },
              status: true,
            },
          })
        : null;
      if (
        input.segmentationCandidateId &&
        (!segmentationCandidate ||
          segmentationCandidate.status !== "PENDING" ||
          segmentationCandidate.job.sourceAssetId !== input.sourceAssetId)
      ) {
        return null;
      }
      const source = await transaction.sourceAsset.findUnique({
        where: { id: input.sourceAssetId },
        select: {
          edition: {
            select: {
              isActive: true,
              work: {
                select: {
                  calligrapher: { select: { isActive: true } },
                  isActive: true,
                },
              },
            },
          },
          height: true,
          mimeType: true,
          objectKey: true,
          width: true,
        },
      });
      if (
        !source ||
        !source.edition.isActive ||
        !source.edition.work.isActive ||
        !source.edition.work.calligrapher.isActive ||
        input.bboxX + input.bboxWidth > source.width ||
        input.bboxY + input.bboxHeight > source.height
      ) {
        return null;
      }
      const character = await transaction.character.upsert({
        create: {
          unicodeCodePoint: input.unicodeCodePoint,
          value: input.character,
        },
        update: {},
        where: { value: input.character },
        select: { id: true },
      });
      if (
        input.observedCharacter !== input.character &&
        input.variantType !== null
      ) {
        await transaction.characterVariant.upsert({
          create: {
            canonicalCharacterId: character.id,
            type: input.variantType,
            value: input.observedCharacter,
          },
          update: {},
          where: {
            canonicalCharacterId_value_type: {
              canonicalCharacterId: character.id,
              type: input.variantType,
              value: input.observedCharacter,
            },
          },
        });
      }
      const glyph = await transaction.glyph.create({
        data: {
          annotatedBy: actorKey,
          authenticityGrade: input.authenticityGrade,
          bboxHeight: input.bboxHeight,
          bboxWidth: input.bboxWidth,
          bboxX: input.bboxX,
          bboxY: input.bboxY,
          beginnerWeight: input.beginnerWeight,
          characterId: character.id,
          contentStatus: "PROCESSING",
          imageQuality: input.imageQuality,
          labelCandidates: input.labelCandidates,
          observedCharacter: input.observedCharacter,
          scriptStyle: "REGULAR",
          sourceAssetId: input.sourceAssetId,
          transcription: input.transcription,
        },
        select: { id: true },
      });
      await transaction.contentAudit.create({
        data: {
          action: "CREATE_GLYPH",
          actorKey,
          entityId: glyph.id,
          entityType: "Glyph",
          snapshot: input as unknown as Prisma.InputJsonValue,
        },
      });
      if (input.segmentationCandidateId) {
        await transaction.contentSegmentationCandidate.update({
          data: {
            annotatedAt: new Date(),
            annotatedBy: actorKey,
            glyphId: glyph.id,
            rejectionNote: null,
            status: "ACCEPTED",
          },
          where: { id: input.segmentationCandidateId },
        });
        await transaction.contentAudit.create({
          data: {
            action: "ACCEPT_SEGMENTATION_CANDIDATE",
            actorKey,
            entityId: input.segmentationCandidateId,
            entityType: "ContentSegmentationCandidate",
            snapshot: { glyphId: glyph.id },
          },
        });
      }
      return {
        glyphId: glyph.id,
        mimeType: source.mimeType,
        sourceObjectKey: source.objectKey,
      };
    });
  }

  async recordGlyphCrop(
    glyphId: string,
    input: {
      checksum: string;
      height: number;
      objectKey: string;
      width: number;
    },
  ): Promise<boolean> {
    const glyph = await this.prisma.glyph.findUnique({
      where: { id: glyphId },
      select: { id: true },
    });
    if (!glyph) return false;
    await this.prisma.$transaction([
      this.prisma.glyphAsset.upsert({
        create: {
          checksum: input.checksum,
          glyphId,
          height: input.height,
          kind: "GLYPH_CROP",
          mimeType: "image/webp",
          objectKey: input.objectKey,
          width: input.width,
        },
        update: {
          checksum: input.checksum,
          height: input.height,
          width: input.width,
        },
        where: { objectKey: input.objectKey },
      }),
      this.prisma.glyph.update({
        data: { contentStatus: "NEEDS_REVIEW" },
        where: { id: glyphId },
      }),
    ]);
    return true;
  }

  async reviewGlyph(
    actorKey: string,
    glyphId: string,
    decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
    note: string | null,
  ): Promise<boolean> {
    const glyph = await this.prisma.glyph.findUnique({
      where: { id: glyphId },
      select: {
        contentStatus: true,
        id: true,
      },
    });
    const latestEditorAudit = await this.prisma.contentAudit.findFirst({
      orderBy: { createdAt: "desc" },
      where: {
        action: { in: ["CREATE_GLYPH", "UPDATE_GLYPH"] },
        entityId: glyphId,
        entityType: "Glyph",
      },
      select: { actorKey: true },
    });
    if (
      !glyph ||
      glyph.contentStatus !== "NEEDS_REVIEW" ||
      latestEditorAudit?.actorKey === actorKey
    ) {
      return false;
    }
    const nextStatus =
      decision === "APPROVED"
        ? "APPROVED"
        : decision === "REJECTED"
          ? "ARCHIVED"
          : "DRAFT";
    await this.prisma.$transaction([
      this.prisma.contentReview.create({
        data: { decision, glyphId, note, reviewerKey: actorKey },
      }),
      this.prisma.glyph.update({
        data: { contentStatus: nextStatus },
        where: { id: glyphId },
      }),
      this.prisma.contentAudit.create({
        data: {
          action: "REVIEW_GLYPH",
          actorKey,
          entityId: glyphId,
          entityType: "Glyph",
          snapshot: {
            decision,
            nextStatus,
            note,
            previousStatus: glyph.contentStatus,
          },
        },
      }),
    ]);
    return true;
  }

  async publishGlyph(
    actorKey: string,
    glyphId: string,
    now: Date,
  ): Promise<boolean> {
    const glyph = await this.prisma.glyph.findUnique({
      where: { id: glyphId },
      select: {
        assets: {
          where: { kind: "GLYPH_CROP" },
          select: { id: true, width: true },
        },
        authenticityGrade: true,
        contentStatus: true,
        sourceAsset: {
          select: {
            edition: {
              select: {
                isActive: true,
                work: {
                  select: {
                    calligrapher: { select: { isActive: true } },
                    isActive: true,
                  },
                },
              },
            },
            rightsRecord: {
              select: {
                maxPublicWidth: true,
                status: true,
                validFrom: true,
                validUntil: true,
              },
            },
          },
        },
      },
    });
    const rights = glyph?.sourceAsset.rightsRecord;
    if (
      !glyph ||
      !["APPROVED", "PUBLISHED"].includes(glyph.contentStatus) ||
      glyph.authenticityGrade === "D_AI_GENERATED" ||
      glyph.assets.length === 0 ||
      !glyph.sourceAsset.edition.isActive ||
      !glyph.sourceAsset.edition.work.isActive ||
      !glyph.sourceAsset.edition.work.calligrapher.isActive ||
      rights?.status !== "CLEARED_PUBLIC" ||
      (rights.validFrom !== null && rights.validFrom > now) ||
      (rights.validUntil !== null && rights.validUntil <= now) ||
      (rights.maxPublicWidth !== null &&
        glyph.assets.some((asset) => asset.width > rights.maxPublicWidth!))
    ) {
      return false;
    }
    if (glyph.contentStatus === "PUBLISHED") return true;
    await this.prisma.$transaction([
      this.prisma.glyph.update({
        data: { contentStatus: "PUBLISHED", publishedAt: now },
        where: { id: glyphId },
      }),
      this.prisma.contentAudit.create({
        data: {
          action: "PUBLISH_GLYPH",
          actorKey,
          entityId: glyphId,
          entityType: "Glyph",
        },
      }),
    ]);
    return true;
  }

  async unpublishGlyph(
    actorKey: string,
    glyphId: string,
    reason: string,
  ): Promise<{ objectKeys: string[] } | null> {
    const glyph = await this.prisma.glyph.findUnique({
      where: { id: glyphId },
      select: {
        assets: { select: { objectKey: true } },
        contentStatus: true,
      },
    });
    if (!glyph) return null;
    if (glyph.contentStatus === "ARCHIVED") {
      const previousUnpublish = await this.prisma.contentAudit.findFirst({
        where: {
          action: "UNPUBLISH_GLYPH",
          entityId: glyphId,
          entityType: "Glyph",
        },
        select: { id: true },
      });
      return previousUnpublish
        ? { objectKeys: glyph.assets.map(({ objectKey }) => objectKey) }
        : null;
    }
    if (glyph.contentStatus !== "PUBLISHED") return null;

    await this.prisma.$transaction([
      this.prisma.glyph.update({
        data: { contentStatus: "ARCHIVED" },
        where: { id: glyphId },
      }),
      this.prisma.contentAudit.create({
        data: {
          action: "UNPUBLISH_GLYPH",
          actorKey,
          entityId: glyphId,
          entityType: "Glyph",
          snapshot: { previousStatus: "PUBLISHED", reason },
        },
      }),
    ]);
    return { objectKeys: glyph.assets.map(({ objectKey }) => objectKey) };
  }

  updateGlyph(actorKey: string, glyphId: string, input: UpdateGlyphInput) {
    return this.prisma.$transaction(async (transaction) => {
      const glyph = await transaction.glyph.findUnique({
        where: { id: glyphId },
        select: {
          authenticityGrade: true,
          bboxHeight: true,
          bboxWidth: true,
          bboxX: true,
          bboxY: true,
          beginnerWeight: true,
          character: { select: { id: true, value: true } },
          contentStatus: true,
          imageQuality: true,
          labelCandidates: true,
          observedCharacter: true,
          annotatedBy: true,
          publishedAt: true,
          sourceAsset: {
            select: {
              height: true,
              mimeType: true,
              objectKey: true,
              width: true,
            },
          },
          transcription: true,
        },
      });
      if (
        !glyph ||
        glyph.contentStatus === "PUBLISHED" ||
        glyph.contentStatus === "PROCESSING"
      ) {
        return null;
      }

      const next = {
        authenticityGrade: input.authenticityGrade ?? glyph.authenticityGrade,
        bboxHeight: input.bboxHeight ?? glyph.bboxHeight,
        bboxWidth: input.bboxWidth ?? glyph.bboxWidth,
        bboxX: input.bboxX ?? glyph.bboxX,
        bboxY: input.bboxY ?? glyph.bboxY,
        beginnerWeight: input.beginnerWeight ?? glyph.beginnerWeight,
        character: input.character ?? glyph.character.value,
        imageQuality: input.imageQuality ?? glyph.imageQuality,
        labelCandidates: input.labelCandidates ?? glyph.labelCandidates,
        observedCharacter:
          input.observedCharacter ??
          glyph.observedCharacter ??
          input.character ??
          glyph.character.value,
        transcription:
          input.transcription === undefined
            ? glyph.transcription
            : input.transcription,
      };
      if (
        next.bboxX + next.bboxWidth > glyph.sourceAsset.width ||
        next.bboxY + next.bboxHeight > glyph.sourceAsset.height
      ) {
        return null;
      }
      if (
        (input.character || input.observedCharacter) &&
        next.observedCharacter !== next.character &&
        !input.variantType
      ) {
        return null;
      }
      const bboxChanged =
        next.bboxX !== glyph.bboxX ||
        next.bboxY !== glyph.bboxY ||
        next.bboxWidth !== glyph.bboxWidth ||
        next.bboxHeight !== glyph.bboxHeight;
      const requiresRecrop =
        bboxChanged ||
        (glyph.contentStatus === "ARCHIVED" && glyph.publishedAt !== null);
      let characterId = glyph.character.id;
      if (input.character && input.unicodeCodePoint) {
        const character = await transaction.character.upsert({
          create: {
            unicodeCodePoint: input.unicodeCodePoint,
            value: input.character,
          },
          update: {},
          where: { value: input.character },
          select: { id: true },
        });
        characterId = character.id;
      }
      if (
        next.observedCharacter !== next.character &&
        input.variantType !== undefined &&
        input.variantType !== null
      ) {
        await transaction.characterVariant.upsert({
          create: {
            canonicalCharacterId: characterId,
            type: input.variantType,
            value: next.observedCharacter,
          },
          update: {},
          where: {
            canonicalCharacterId_value_type: {
              canonicalCharacterId: characterId,
              type: input.variantType,
              value: next.observedCharacter,
            },
          },
        });
      }
      const nextStatus: GlyphCorrectionResult["status"] = requiresRecrop
        ? "PROCESSING"
        : "NEEDS_REVIEW";
      await transaction.glyph.update({
        data: {
          annotatedBy: actorKey,
          authenticityGrade: next.authenticityGrade,
          bboxHeight: next.bboxHeight,
          bboxWidth: next.bboxWidth,
          bboxX: next.bboxX,
          bboxY: next.bboxY,
          beginnerWeight: next.beginnerWeight,
          characterId,
          contentStatus: nextStatus,
          imageQuality: next.imageQuality,
          labelCandidates: next.labelCandidates ?? undefined,
          observedCharacter: next.observedCharacter,
          transcription: next.transcription,
        },
        where: { id: glyphId },
      });
      await transaction.contentAudit.create({
        data: {
          action: "UPDATE_GLYPH",
          actorKey,
          entityId: glyphId,
          entityType: "Glyph",
          snapshot: {
            after: { ...next, contentStatus: nextStatus },
            before: {
              authenticityGrade: glyph.authenticityGrade,
              bboxHeight: glyph.bboxHeight,
              bboxWidth: glyph.bboxWidth,
              bboxX: glyph.bboxX,
              bboxY: glyph.bboxY,
              beginnerWeight: glyph.beginnerWeight,
              character: glyph.character.value,
              contentStatus: glyph.contentStatus,
              imageQuality: glyph.imageQuality,
              labelCandidates: glyph.labelCandidates,
              observedCharacter: glyph.observedCharacter,
              transcription: glyph.transcription,
            },
          },
        },
      });
      return {
        cropJob: requiresRecrop
          ? {
              bboxHeight: next.bboxHeight,
              bboxWidth: next.bboxWidth,
              bboxX: next.bboxX,
              bboxY: next.bboxY,
              mimeType: glyph.sourceAsset.mimeType,
              sourceObjectKey: glyph.sourceAsset.objectKey,
            }
          : null,
        status: nextStatus,
      };
    });
  }

  updateCalligrapher(
    actorKey: string,
    id: string,
    input: UpdateCalligrapherInput,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const before = await transaction.calligrapher.findUnique({
        where: { id },
        select: {
          biography: true,
          dynasty: true,
          id: true,
          isActive: true,
          name: true,
        },
      });
      if (!before) return null;
      const shouldArchive = (input.isActive ?? before.isActive) === false;
      const glyphs = shouldArchive
        ? await transaction.glyph.findMany({
            where: {
              contentStatus: { in: ["PUBLISHED", "ARCHIVED"] },
              sourceAsset: { edition: { work: { calligrapherId: id } } },
            },
            select: {
              assets: { select: { objectKey: true, width: true } },
              contentStatus: true,
              id: true,
            },
          })
        : [];
      const record = await transaction.calligrapher.update({
        data: input,
        where: { id },
        select: {
          biography: true,
          dynasty: true,
          id: true,
          isActive: true,
          name: true,
        },
      });
      await transaction.contentAudit.create({
        data: {
          action: "UPDATE_CALLIGRAPHER",
          actorKey,
          entityId: id,
          entityType: "Calligrapher",
          snapshot: asAuditJson({ before, after: record }),
        },
      });
      return {
        archivedObjectKeys: await this.archivePublishedGlyphs(
          transaction,
          glyphs,
          actorKey,
          "CALLIGRAPHER_DEACTIVATED",
        ),
        record,
      };
    });
  }

  updateWork(actorKey: string, id: string, input: UpdateWorkInput) {
    return this.prisma.$transaction(async (transaction) => {
      const before = await transaction.work.findUnique({
        where: { id },
        select: {
          calligrapher: { select: { id: true, isActive: true, name: true } },
          description: true,
          dynasty: true,
          id: true,
          isActive: true,
          title: true,
        },
      });
      if (!before) return null;
      const shouldArchive = (input.isActive ?? before.isActive) === false;
      const glyphs = shouldArchive
        ? await transaction.glyph.findMany({
            where: {
              contentStatus: { in: ["PUBLISHED", "ARCHIVED"] },
              sourceAsset: { edition: { workId: id } },
            },
            select: {
              assets: { select: { objectKey: true, width: true } },
              contentStatus: true,
              id: true,
            },
          })
        : [];
      const record = await transaction.work.update({
        data: input,
        where: { id },
        select: {
          calligrapher: { select: { id: true, isActive: true, name: true } },
          description: true,
          dynasty: true,
          id: true,
          isActive: true,
          title: true,
        },
      });
      await transaction.contentAudit.create({
        data: {
          action: "UPDATE_WORK",
          actorKey,
          entityId: id,
          entityType: "Work",
          snapshot: asAuditJson({ before, after: record }),
        },
      });
      return {
        archivedObjectKeys: await this.archivePublishedGlyphs(
          transaction,
          glyphs,
          actorKey,
          "WORK_DEACTIVATED",
        ),
        record,
      };
    });
  }

  updateEdition(actorKey: string, id: string, input: UpdateEditionInput) {
    return this.prisma.$transaction(async (transaction) => {
      const selection = {
        holdingInstitution: true,
        id: true,
        isActive: true,
        name: true,
        publication: true,
        sourceUrl: true,
        work: {
          select: {
            calligrapher: { select: { isActive: true } },
            id: true,
            isActive: true,
            title: true,
          },
        },
      } satisfies Prisma.WorkEditionSelect;
      const before = await transaction.workEdition.findUnique({
        where: { id },
        select: selection,
      });
      if (!before) return null;
      const shouldArchive = (input.isActive ?? before.isActive) === false;
      const glyphs = shouldArchive
        ? await transaction.glyph.findMany({
            where: {
              contentStatus: { in: ["PUBLISHED", "ARCHIVED"] },
              sourceAsset: { editionId: id },
            },
            select: {
              assets: { select: { objectKey: true, width: true } },
              contentStatus: true,
              id: true,
            },
          })
        : [];
      const record = await transaction.workEdition.update({
        data: input,
        where: { id },
        select: selection,
      });
      await transaction.contentAudit.create({
        data: {
          action: "UPDATE_EDITION",
          actorKey,
          entityId: id,
          entityType: "WorkEdition",
          snapshot: asAuditJson({ before, after: record }),
        },
      });
      return {
        archivedObjectKeys: await this.archivePublishedGlyphs(
          transaction,
          glyphs,
          actorKey,
          "EDITION_DEACTIVATED",
        ),
        record,
      };
    });
  }

  updateRights(
    actorKey: string,
    id: string,
    input: UpdateRightsInput,
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const selection = {
        allowCommercial: true,
        attributionText: true,
        id: true,
        licenseName: true,
        maxPublicWidth: true,
        notes: true,
        sourceName: true,
        sourceUrl: true,
        status: true,
        validFrom: true,
        validUntil: true,
      } satisfies Prisma.RightsRecordSelect;
      const before = await transaction.rightsRecord.findUnique({
        where: { id },
        select: selection,
      });
      if (!before) return null;
      const next = { ...before, ...input };
      const candidates = await transaction.glyph.findMany({
        where: {
          contentStatus: { in: ["PUBLISHED", "ARCHIVED"] },
          sourceAsset: { rightsRecordId: id },
        },
        select: {
          assets: { select: { objectKey: true, width: true } },
          contentStatus: true,
          id: true,
        },
      });
      const glyphs = candidates.filter(
        (glyph) =>
          next.status !== "CLEARED_PUBLIC" ||
          (next.validFrom !== null && next.validFrom > now) ||
          (next.validUntil !== null && next.validUntil <= now) ||
          (next.maxPublicWidth !== null &&
            glyph.assets.some(({ width }) => width > next.maxPublicWidth!)),
      );
      const record = await transaction.rightsRecord.update({
        data: input,
        where: { id },
        select: selection,
      });
      await transaction.contentAudit.create({
        data: {
          action: "UPDATE_RIGHTS",
          actorKey,
          entityId: id,
          entityType: "RightsRecord",
          snapshot: asAuditJson({ before, after: record }),
        },
      });
      return {
        archivedObjectKeys: await this.archivePublishedGlyphs(
          transaction,
          glyphs,
          actorKey,
          "RIGHTS_NO_LONGER_PUBLIC",
        ),
        record,
      };
    });
  }

  createCalligrapher(actorKey: string, input: CreateCalligrapherInput) {
    return this.prisma.$transaction(async (transaction) => {
      const created = await transaction.calligrapher.create({
        data: input,
        select: {
          biography: true,
          dynasty: true,
          id: true,
          isActive: true,
          name: true,
        },
      });
      await transaction.contentAudit.create({
        data: {
          action: "CREATE_CALLIGRAPHER",
          actorKey,
          entityId: created.id,
          entityType: "Calligrapher",
          snapshot: input as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });
  }

  createWork(actorKey: string, input: CreateWorkInput) {
    return this.prisma.$transaction(async (transaction) => {
      const calligrapher = await transaction.calligrapher.findFirst({
        where: { id: input.calligrapherId, isActive: true },
        select: { id: true },
      });
      if (!calligrapher) return null;
      const created = await transaction.work.create({
        data: { ...input, scriptStyle: "REGULAR" },
        select: { id: true },
      });
      await transaction.contentAudit.create({
        data: {
          action: "CREATE_WORK",
          actorKey,
          entityId: created.id,
          entityType: "Work",
          snapshot: input as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });
  }

  createEdition(actorKey: string, input: CreateEditionInput) {
    return this.prisma.$transaction(async (transaction) => {
      const work = await transaction.work.findFirst({
        where: {
          id: input.workId,
          isActive: true,
          calligrapher: { isActive: true },
        },
        select: { id: true },
      });
      if (!work) return null;
      const created = await transaction.workEdition.create({
        data: input,
        select: { id: true },
      });
      await transaction.contentAudit.create({
        data: {
          action: "CREATE_EDITION",
          actorKey,
          entityId: created.id,
          entityType: "WorkEdition",
          snapshot: input as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });
  }

  createRights(actorKey: string, input: CreateRightsInput) {
    return this.prisma.$transaction(async (transaction) => {
      const created = await transaction.rightsRecord.create({
        data: input,
        select: { id: true },
      });
      await transaction.contentAudit.create({
        data: {
          action: "CREATE_RIGHTS",
          actorKey,
          entityId: created.id,
          entityType: "RightsRecord",
          snapshot: {
            ...input,
            validFrom: input.validFrom?.toISOString() ?? null,
            validUntil: input.validUntil?.toISOString() ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      return created;
    });
  }
}
