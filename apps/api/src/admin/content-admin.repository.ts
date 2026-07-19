import type {
  AdminCalligrapher,
  AdminContentImportBatch,
  ContentHistoryAudit,
  ContentHistoryEntityType,
  ContentImportCommitResult,
  ContentImportPreparedRow,
  AdminEdition,
  AdminRights,
  AdminSegmentationJob,
  AdminGlyph,
  AdminSourceAsset,
  AdminWork,
  CreateCalligrapherInput,
  CreateEditionInput,
  CreateGlyphInput,
  CreateRightsInput,
  CreateSegmentationJobResult,
  CreateSourceUploadInput,
  CreateSourceUploadResult,
  CreateWorkInput,
  GlyphCorrectionResult,
  MasterDataUpdateResult,
  PendingSourceUpload,
  PendingSegmentationCandidate,
  PrivateSourceAsset,
  SegmentationCandidateInput,
  UpdateCalligrapherInput,
  UpdateEditionInput,
  UpdateGlyphInput,
  UpdateRightsInput,
  UpdateWorkInput,
} from "./content-admin.types.js";

export const CONTENT_ADMIN_REPOSITORY = Symbol("CONTENT_ADMIN_REPOSITORY");

export interface ContentAdminRepository {
  createContentImportBatch(
    actorKey: string,
    input: {
      checksumSha256: string;
      fileName: string;
      rows: ContentImportPreparedRow[];
    },
  ): Promise<AdminContentImportBatch>;
  listContentImportBatches(): Promise<AdminContentImportBatch[]>;
  commitContentImportBatch(
    actorKey: string,
    batchId: string,
    now: Date,
  ): Promise<ContentImportCommitResult | null>;
  createCalligrapher(
    actorKey: string,
    input: CreateCalligrapherInput,
  ): Promise<AdminCalligrapher>;
  createEdition(
    actorKey: string,
    input: CreateEditionInput,
  ): Promise<{ id: string } | null>;
  createRights(
    actorKey: string,
    input: CreateRightsInput,
  ): Promise<{ id: string }>;
  createSourceUpload(
    actorKey: string,
    input: CreateSourceUploadInput & {
      expiresAt: Date;
      now: Date;
      objectKey: string;
    },
  ): Promise<CreateSourceUploadResult | null>;
  createWork(
    actorKey: string,
    input: CreateWorkInput,
  ): Promise<{ id: string } | null>;
  listCalligraphers(): Promise<AdminCalligrapher[]>;
  listEditions(): Promise<AdminEdition[]>;
  listRights(): Promise<AdminRights[]>;
  listWorks(): Promise<AdminWork[]>;
  listContentHistory(
    entityType: ContentHistoryEntityType,
    entityId: string,
  ): Promise<ContentHistoryAudit[]>;
  findContentHistory(auditId: string): Promise<ContentHistoryAudit | null>;
  updateCalligrapher(
    actorKey: string,
    id: string,
    input: UpdateCalligrapherInput,
  ): Promise<MasterDataUpdateResult<AdminCalligrapher> | null>;
  updateWork(
    actorKey: string,
    id: string,
    input: UpdateWorkInput,
  ): Promise<MasterDataUpdateResult<AdminWork> | null>;
  updateEdition(
    actorKey: string,
    id: string,
    input: UpdateEditionInput,
  ): Promise<MasterDataUpdateResult<AdminEdition> | null>;
  updateRights(
    actorKey: string,
    id: string,
    input: UpdateRightsInput,
    now: Date,
  ): Promise<MasterDataUpdateResult<AdminRights> | null>;
  findSourceUpload(
    uploadId: string,
    actorKey: string,
  ): Promise<PendingSourceUpload | null>;
  completeSourceUpload(
    uploadId: string,
    actorKey: string,
    completedAt: Date,
  ): Promise<{ sourceAssetId: string }>;
  createGlyph(
    actorKey: string,
    input: CreateGlyphInput,
  ): Promise<{
    glyphId: string;
    mimeType: string;
    sourceObjectKey: string;
  } | null>;
  listGlyphs(): Promise<AdminGlyph[]>;
  listSourceAssets(): Promise<AdminSourceAsset[]>;
  findPrivateSourceAsset(
    sourceAssetId: string,
  ): Promise<PrivateSourceAsset | null>;
  findSegmentationCandidate(
    candidateId: string,
  ): Promise<PendingSegmentationCandidate | null>;
  rejectSegmentationCandidate(
    actorKey: string,
    candidateId: string,
    note: string,
    now: Date,
  ): Promise<boolean>;
  listSegmentationJobs(): Promise<AdminSegmentationJob[]>;
  createSegmentationJob(
    actorKey: string,
    sourceAssetId: string,
  ): Promise<CreateSegmentationJobResult | null>;
  markSegmentationProcessing(jobId: string, now: Date): Promise<boolean>;
  recordSegmentationResult(
    jobId: string,
    algorithmVersion: string,
    candidates: SegmentationCandidateInput[],
    now: Date,
  ): Promise<boolean>;
  recordSegmentationFailure(
    jobId: string,
    failureCode: string,
    failureMessage: string,
    now: Date,
  ): Promise<boolean>;
  recordGlyphCrop(
    glyphId: string,
    input: {
      checksum: string;
      height: number;
      objectKey: string;
      width: number;
    },
  ): Promise<boolean>;
  reviewGlyph(
    actorKey: string,
    glyphId: string,
    decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
    note: string | null,
  ): Promise<boolean>;
  publishGlyph(actorKey: string, glyphId: string, now: Date): Promise<boolean>;
  unpublishGlyph(
    actorKey: string,
    glyphId: string,
    reason: string,
  ): Promise<{ objectKeys: string[] } | null>;
  updateGlyph(
    actorKey: string,
    glyphId: string,
    input: UpdateGlyphInput,
  ): Promise<GlyphCorrectionResult | null>;
}
