export interface AdminCalligrapher {
  biography: string | null;
  dynasty: string;
  id: string;
  isActive: boolean;
  name: string;
}

export interface AdminWork {
  calligrapher: { id: string; isActive: boolean; name: string };
  dynasty: string;
  description: string | null;
  id: string;
  isActive: boolean;
  title: string;
}

export interface AdminEdition {
  holdingInstitution: string | null;
  id: string;
  isActive: boolean;
  name: string;
  publication: string | null;
  sourceUrl: string | null;
  work: {
    calligrapher: { isActive: boolean };
    id: string;
    isActive: boolean;
    title: string;
  };
}

export interface AdminRights {
  allowCommercial: boolean;
  attributionText: string | null;
  id: string;
  licenseName: string | null;
  maxPublicWidth: number | null;
  notes: string | null;
  sourceName: string;
  sourceUrl: string | null;
  status:
    | "UNKNOWN"
    | "INTERNAL_TEST_ONLY"
    | "CLEARED_PUBLIC"
    | "RESTRICTED"
    | "EXPIRED";
  validFrom: Date | null;
  validUntil: Date | null;
}

export interface MasterDataUpdateResult<T> {
  archivedObjectKeys: string[];
  record: T;
}

export type ContentHistoryEntityType =
  "Calligrapher" | "Work" | "WorkEdition" | "RightsRecord" | "Glyph";

export interface ContentHistoryAudit {
  action: string;
  actorKey: string;
  createdAt: Date;
  entityId: string;
  entityType: string;
  id: string;
  snapshot: unknown;
}

export interface AdminContentHistoryEntry extends ContentHistoryAudit {
  changes: Array<{ after: unknown; before: unknown; field: string }>;
  canRestore: boolean;
}

export interface CreateSourceUploadInput {
  checksumSha256: string;
  editionId: string;
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  pageLabel: string | null;
  rightsRecordId: string;
  sizeBytes: number;
  width: number;
}

export interface PendingSourceUpload extends CreateSourceUploadInput {
  actorKey: string;
  expiresAt: Date;
  id: string;
  objectKey: string;
  sourceAssetId: string | null;
}

export type CreateSourceUploadResult =
  | { status: "CREATED"; uploadId: string }
  | {
      duplicateKind: "SOURCE_ASSET" | "ACTIVE_UPLOAD";
      status: "DUPLICATE";
    };

export interface AdminSourceAsset {
  edition: { name: string; work: { title: string } };
  height: number;
  id: string;
  pageLabel: string | null;
  width: number;
}

export interface PrivateSourceAsset {
  height: number;
  mimeType: string;
  objectKey: string;
  width: number;
}

export interface SegmentationCandidateInput {
  bboxHeight: number;
  bboxWidth: number;
  bboxX: number;
  bboxY: number;
  confidence: number;
  sortOrder: number;
}

export interface AdminSegmentationJob {
  algorithmVersion: string | null;
  candidates: Array<
    SegmentationCandidateInput & {
      annotatedAt: Date | null;
      annotatedBy: string | null;
      glyphId: string | null;
      id: string;
      rejectionNote: string | null;
      status: string;
    }
  >;
  completedAt: Date | null;
  createdAt: Date;
  failureCode: string | null;
  failureMessage: string | null;
  id: string;
  requestedBy: string;
  sourceAsset: {
    edition: { name: string; work: { title: string } };
    height: number;
    id: string;
    pageLabel: string | null;
    width: number;
  };
  startedAt: Date | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
}

export interface CreateSegmentationJobResult {
  created: boolean;
  jobId: string;
  mimeType: string | null;
  sourceObjectKey: string | null;
  status: "PENDING" | "PROCESSING";
}

export interface AdminGlyph {
  authenticityGrade:
    | "A_ORIGINAL"
    | "B_RUBBING_OR_AUTHORIZED_EDITION"
    | "C_MODERN_COPY"
    | "D_AI_GENERATED";
  bboxHeight: number;
  bboxWidth: number;
  bboxX: number;
  bboxY: number;
  beginnerWeight: number;
  character: { value: string };
  contentStatus: string;
  id: string;
  imageQuality: number;
  labelCandidates: unknown;
  observedCharacter: string | null;
  annotatedBy: string | null;
  sourceAsset: { edition: { work: { title: string } } };
  transcription: string | null;
}

export interface CreateGlyphInput {
  authenticityGrade:
    "A_ORIGINAL" | "B_RUBBING_OR_AUTHORIZED_EDITION" | "C_MODERN_COPY";
  bboxHeight: number;
  bboxWidth: number;
  bboxX: number;
  bboxY: number;
  beginnerWeight: number;
  character: string;
  imageQuality: number;
  labelCandidates: string[];
  observedCharacter: string;
  segmentationCandidateId: string | null;
  sourceAssetId: string;
  transcription: string | null;
  unicodeCodePoint: string;
  variantType:
    "SIMPLIFIED" | "TRADITIONAL" | "HISTORICAL" | "COMPATIBILITY" | null;
}

export interface ContentImportPreparedRow {
  errors: string[];
  input: CreateGlyphInput | null;
  rawData: Record<string, string>;
  rowNumber: number;
  targetGlyphId: string | null;
}

export interface AdminContentImportBatch {
  actorKey: string;
  checksumSha256: string;
  committedAt: Date | null;
  createdAt: Date;
  fileName: string;
  id: string;
  invalidRows: number;
  rows: Array<{
    errors: string[];
    normalizedData: CreateGlyphInput | null;
    rawData: Record<string, string>;
    rowNumber: number;
    targetGlyphId: string | null;
  }>;
  status: "INVALID" | "READY" | "COMMITTED";
  totalRows: number;
  validRows: number;
}

export interface ContentImportCommitResult {
  batchId: string;
  cropJobs: Array<{
    bboxHeight: number;
    bboxWidth: number;
    bboxX: number;
    bboxY: number;
    glyphId: string;
    mimeType: string;
    outputObjectKey: string;
    sourceObjectKey: string;
  }>;
  glyphCount: number;
  status: "COMMITTED";
}

export interface PendingSegmentationCandidate {
  bboxHeight: number;
  bboxWidth: number;
  bboxX: number;
  bboxY: number;
  id: string;
  sourceAssetId: string;
  status: string;
}

export interface UpdateGlyphInput {
  authenticityGrade?:
    "A_ORIGINAL" | "B_RUBBING_OR_AUTHORIZED_EDITION" | "C_MODERN_COPY";
  bboxHeight?: number;
  bboxWidth?: number;
  bboxX?: number;
  bboxY?: number;
  beginnerWeight?: number;
  character?: string;
  imageQuality?: number;
  labelCandidates?: string[];
  observedCharacter?: string;
  transcription?: string | null;
  unicodeCodePoint?: string;
  variantType?:
    "SIMPLIFIED" | "TRADITIONAL" | "HISTORICAL" | "COMPATIBILITY" | null;
}

export interface GlyphCorrectionResult {
  cropJob: {
    bboxHeight: number;
    bboxWidth: number;
    bboxX: number;
    bboxY: number;
    mimeType: string;
    sourceObjectKey: string;
  } | null;
  status: "NEEDS_REVIEW" | "PROCESSING";
}

export interface CreateCalligrapherInput {
  biography: string | null;
  dynasty: string;
  name: string;
}

export interface CreateWorkInput {
  calligrapherId: string;
  description: string | null;
  dynasty: string;
  title: string;
}

export interface CreateEditionInput {
  holdingInstitution: string | null;
  name: string;
  publication: string | null;
  sourceUrl: string | null;
  workId: string;
}

export interface CreateRightsInput {
  allowCommercial: boolean;
  attributionText: string | null;
  licenseName: string | null;
  maxPublicWidth: number | null;
  notes: string | null;
  sourceName: string;
  sourceUrl: string | null;
  status: "INTERNAL_TEST_ONLY" | "CLEARED_PUBLIC" | "RESTRICTED";
  validFrom: Date | null;
  validUntil: Date | null;
}

export interface UpdateCalligrapherInput {
  biography?: string | null;
  dynasty?: string;
  isActive?: boolean;
  name?: string;
}

export interface UpdateWorkInput {
  description?: string | null;
  dynasty?: string;
  isActive?: boolean;
  title?: string;
}

export interface UpdateEditionInput {
  holdingInstitution?: string | null;
  isActive?: boolean;
  name?: string;
  publication?: string | null;
  sourceUrl?: string | null;
}

export interface UpdateRightsInput {
  allowCommercial?: boolean;
  attributionText?: string | null;
  licenseName?: string | null;
  maxPublicWidth?: number | null;
  notes?: string | null;
  sourceName?: string;
  sourceUrl?: string | null;
  status?: "INTERNAL_TEST_ONLY" | "CLEARED_PUBLIC" | "RESTRICTED" | "EXPIRED";
  validFrom?: Date | null;
  validUntil?: Date | null;
}
