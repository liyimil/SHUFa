import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { sanitizeDiagnosticMessage } from "@calligraphy/observability";

import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../upload/object-storage.js";
import {
  CONTENT_ADMIN_REPOSITORY,
  type ContentAdminRepository,
} from "./content-admin.repository.js";
import {
  CONTENT_PROCESSING_QUEUE,
  type ContentProcessingQueue,
} from "./content-processing.queue.js";
import {
  contentImportTemplate,
  parseContentImportCsv,
} from "./content-import.csv.js";
import type {
  ContentImportPreparedRow,
  CreateGlyphInput,
  MasterDataUpdateResult,
  ContentHistoryEntityType,
  UpdateCalligrapherInput,
  UpdateEditionInput,
  UpdateGlyphInput,
  UpdateRightsInput,
  UpdateWorkInput,
} from "./content-admin.types.js";
import {
  PUBLIC_CATALOG_INVALIDATOR,
  type PublicCatalogInvalidator,
} from "./public-catalog-invalidator.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) {
    throw new BadRequestException({
      code: "INVALID_CONTENT_FIELD",
      message: `${field}不能为空且不能超过 ${maxLength} 个字符。`,
    });
  }
  return text;
}

function optionalText(value: unknown, maxLength = 2_000): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new BadRequestException({
      code: "INVALID_CONTENT_FIELD",
      message: "可选文本字段格式无效。",
    });
  }
  return value.trim();
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new BadRequestException({
      code: "INVALID_CONTENT_REFERENCE",
      message: `${field}不是有效的内容 ID。`,
    });
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException({
      code: "INVALID_CONTENT_FIELD",
      message: `${field}必须是布尔值。`,
    });
  }
  return value;
}

function nullableDate(value: unknown, field: string): Date | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new BadRequestException({
      code: "INVALID_RIGHTS_DATE",
      message: `${field}无效。`,
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({
      code: "INVALID_RIGHTS_DATE",
      message: `${field}无效。`,
    });
  }
  return parsed;
}

function nullablePositiveInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new BadRequestException({
      code: "INVALID_CONTENT_FIELD",
      message: `${field}必须是正整数。`,
    });
  }
  return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hanCharacter(value: unknown, field: string): string {
  const character =
    typeof value === "string" ? value.trim().normalize("NFC") : "";
  if (!/^\p{Script=Han}$/u.test(character)) {
    throw new BadRequestException({
      code: "INVALID_GLYPH_CHARACTER",
      message: `${field}必须是一个汉字。`,
    });
  }
  return character;
}

function labelCandidates(value: unknown, observedCharacter: string): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[、,，\s]+/u)
      : [];
  const normalized = values
    .map((item) =>
      typeof item === "string" ? item.trim().normalize("NFC") : "",
    )
    .filter(Boolean);
  if (
    normalized.length > 10 ||
    normalized.some((candidate) => !/^\p{Script=Han}$/u.test(candidate))
  ) {
    throw new BadRequestException({
      code: "INVALID_CHARACTER_CANDIDATES",
      message: "字符候选最多十个，且每项必须是一个汉字。",
    });
  }
  return [...new Set([observedCharacter, ...normalized])];
}

function glyphVariantType(
  value: unknown,
  required: boolean,
): "SIMPLIFIED" | "TRADITIONAL" | "HISTORICAL" | "COMPATIBILITY" | null {
  if (!required && (value === null || value === undefined || value === "")) {
    return null;
  }
  const type = String(value ?? "");
  if (
    !["SIMPLIFIED", "TRADITIONAL", "HISTORICAL", "COMPATIBILITY"].includes(type)
  ) {
    throw new BadRequestException({
      code: "INVALID_CHARACTER_VARIANT_TYPE",
      message: required
        ? "原帖字与规范字不同时必须选择异体关系。"
        : "异体关系无效。",
    });
  }
  return type as "SIMPLIFIED" | "TRADITIONAL" | "HISTORICAL" | "COMPATIBILITY";
}

function normalizeCreateGlyphInput(
  raw: Record<string, unknown>,
): CreateGlyphInput {
  const observedCharacter = hanCharacter(
    raw.observedCharacter ?? raw.character,
    "原帖字",
  );
  const character = hanCharacter(
    raw.canonicalCharacter ?? raw.character,
    "最终规范字",
  );
  const variantType = glyphVariantType(
    raw.variantType,
    observedCharacter !== character,
  );
  const authenticityGrade = String(raw.authenticityGrade ?? "");
  if (
    ![
      "A_ORIGINAL",
      "B_RUBBING_OR_AUTHORIZED_EDITION",
      "C_MODERN_COPY",
    ].includes(authenticityGrade)
  ) {
    throw new BadRequestException({
      code: "INVALID_AUTHENTICITY_GRADE",
      message: "真实性等级无效；AI 生成内容不能进入名家字库。",
    });
  }
  const numbers = {
    bboxHeight: Number(raw.bboxHeight),
    bboxWidth: Number(raw.bboxWidth),
    bboxX: Number(raw.bboxX),
    bboxY: Number(raw.bboxY),
    beginnerWeight: Number(raw.beginnerWeight ?? 0),
    imageQuality: Number(raw.imageQuality ?? 0),
  };
  if (
    !Object.values(numbers).every(Number.isInteger) ||
    numbers.bboxX < 0 ||
    numbers.bboxY < 0 ||
    numbers.bboxWidth <= 0 ||
    numbers.bboxHeight <= 0 ||
    numbers.beginnerWeight < 0 ||
    numbers.beginnerWeight > 100 ||
    numbers.imageQuality < 0 ||
    numbers.imageQuality > 100
  ) {
    throw new BadRequestException({
      code: "INVALID_GLYPH_BBOX",
      message: "单字框或质量权重无效。",
    });
  }
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) throw new BadRequestException();
  return {
    ...numbers,
    authenticityGrade: authenticityGrade as
      "A_ORIGINAL" | "B_RUBBING_OR_AUTHORIZED_EDITION" | "C_MODERN_COPY",
    character,
    labelCandidates: labelCandidates(
      raw.characterCandidates ?? raw.labelCandidates,
      observedCharacter,
    ),
    observedCharacter,
    segmentationCandidateId: raw.segmentationCandidateId
      ? requiredUuid(raw.segmentationCandidateId, "预切分候选框")
      : null,
    sourceAssetId: requiredUuid(raw.sourceAssetId, "来源资产"),
    transcription: optionalText(raw.transcription, 10_000),
    unicodeCodePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
    variantType,
  };
}

function importErrorMessage(error: unknown): string {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    if (isRecord(response) && typeof response.message === "string") {
      return response.message;
    }
  }
  return "该行格式无效。";
}

function contentChanges(snapshot: unknown) {
  if (!isRecord(snapshot)) return [];
  const before = isRecord(snapshot.before) ? snapshot.before : null;
  const after = isRecord(snapshot.after) ? snapshot.after : null;
  if (!before || !after) return [];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(
      (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
    )
    .map((field) => ({
      after: after[field] ?? null,
      before: before[field] ?? null,
      field,
    }));
}

const restorableActions = new Set([
  "UPDATE_CALLIGRAPHER",
  "UPDATE_WORK",
  "UPDATE_EDITION",
  "UPDATE_RIGHTS",
  "UPDATE_GLYPH",
]);

@Injectable()
export class ContentAdminService {
  constructor(
    @Inject(CONTENT_ADMIN_REPOSITORY)
    private readonly repository: ContentAdminRepository,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    @Inject(CONTENT_PROCESSING_QUEUE)
    private readonly processingQueue: ContentProcessingQueue,
    @Inject(PUBLIC_CATALOG_INVALIDATOR)
    private readonly publicCatalogInvalidator: PublicCatalogInvalidator,
  ) {}

  listCalligraphers() {
    return this.repository.listCalligraphers();
  }

  listWorks() {
    return this.repository.listWorks();
  }

  listEditions() {
    return this.repository.listEditions();
  }

  listRights() {
    return this.repository.listRights();
  }

  contentImportTemplate() {
    return contentImportTemplate;
  }

  listContentImportBatches() {
    return this.repository.listContentImportBatches();
  }

  async previewContentImport(actorKey: string, raw: Record<string, unknown>) {
    const fileName = requiredText(raw.fileName, "文件名", 255);
    if (!fileName.toLowerCase().endsWith(".csv")) {
      throw new BadRequestException({
        code: "INVALID_CONTENT_IMPORT_FILE",
        message: "批量导入文件必须使用 CSV 格式。",
      });
    }
    const csvText = typeof raw.csvText === "string" ? raw.csvText : "";
    const parsedRows = parseContentImportCsv(csvText);
    const rows: ContentImportPreparedRow[] = parsedRows.map((row) => {
      const source = row.rawData;
      try {
        return {
          errors: [],
          input: normalizeCreateGlyphInput({
            authenticityGrade: source.authenticity_grade,
            bboxHeight: source.bbox_height,
            bboxWidth: source.bbox_width,
            bboxX: source.bbox_x,
            bboxY: source.bbox_y,
            beginnerWeight: source.beginner_weight,
            canonicalCharacter: source.canonical_character,
            characterCandidates: source.character_candidates,
            imageQuality: source.image_quality,
            observedCharacter: source.observed_character,
            sourceAssetId: source.source_asset_id,
            transcription: source.transcription,
            variantType: source.variant_type,
          }),
          rawData: source,
          rowNumber: row.rowNumber,
          targetGlyphId: randomUUID(),
        };
      } catch (error: unknown) {
        return {
          errors: [importErrorMessage(error)],
          input: null,
          rawData: source,
          rowNumber: row.rowNumber,
          targetGlyphId: null,
        };
      }
    });
    return this.repository.createContentImportBatch(actorKey, {
      checksumSha256: createHash("sha256").update(csvText).digest("hex"),
      fileName,
      rows,
    });
  }

  async commitContentImport(
    actorKey: string,
    batchId: string,
    now: Date = new Date(),
  ) {
    const result = await this.repository.commitContentImportBatch(
      actorKey,
      requiredUuid(batchId, "导入批次"),
      now,
    );
    if (!result) {
      throw new BadRequestException({
        code: "CONTENT_IMPORT_NOT_READY",
        message: "导入批次不存在、包含错误，或来源数据已发生变化，请重新预检。",
      });
    }
    for (const cropJob of result.cropJobs) {
      await this.processingQueue.enqueueGlyphCrop(cropJob);
    }
    return {
      batchId: result.batchId,
      glyphCount: result.glyphCount,
      status: result.status,
    };
  }

  async listContentHistory(entityTypeValue: unknown, entityIdValue: unknown) {
    const allowedTypes = new Set<ContentHistoryEntityType>([
      "Calligrapher",
      "Work",
      "WorkEdition",
      "RightsRecord",
      "Glyph",
    ]);
    const entityType = String(
      entityTypeValue ?? "",
    ) as ContentHistoryEntityType;
    if (!allowedTypes.has(entityType)) {
      throw new BadRequestException({
        code: "INVALID_HISTORY_ENTITY_TYPE",
        message: "历史记录类型无效。",
      });
    }
    const entries = await this.repository.listContentHistory(
      entityType,
      requiredUuid(entityIdValue, "内容"),
    );
    return entries.map((entry) => ({
      ...entry,
      canRestore:
        restorableActions.has(entry.action) &&
        isRecord(entry.snapshot) &&
        isRecord(entry.snapshot.before),
      changes: contentChanges(entry.snapshot),
    }));
  }

  async restoreContentHistory(
    actorKey: string,
    roles: string[],
    auditId: string,
  ) {
    const audit = await this.repository.findContentHistory(
      requiredUuid(auditId, "历史记录"),
    );
    if (!audit) {
      throw new NotFoundException({
        code: "CONTENT_HISTORY_NOT_FOUND",
        message: "历史记录不存在。",
      });
    }
    if (
      !restorableActions.has(audit.action) ||
      !isRecord(audit.snapshot) ||
      !isRecord(audit.snapshot.before)
    ) {
      throw new BadRequestException({
        code: "CONTENT_HISTORY_NOT_RESTORABLE",
        message: "该记录不是可恢复的编辑版本。",
      });
    }
    const isRights = audit.entityType === "RightsRecord";
    const allowed = isRights
      ? roles.includes("ADMIN") || roles.includes("RIGHTS")
      : roles.includes("ADMIN") || roles.includes("EDITOR");
    if (!allowed) {
      throw new ForbiddenException({
        code: "CONTENT_HISTORY_RESTORE_FORBIDDEN",
        message: "当前角色不能恢复该类内容。",
      });
    }
    const before = audit.snapshot.before;
    switch (audit.entityType) {
      case "Calligrapher":
        return this.updateCalligrapher(actorKey, audit.entityId, before);
      case "Work":
        return this.updateWork(actorKey, audit.entityId, before);
      case "WorkEdition":
        return this.updateEdition(actorKey, audit.entityId, before);
      case "RightsRecord":
        return this.updateRights(actorKey, audit.entityId, before);
      case "Glyph":
        return this.updateGlyph(actorKey, audit.entityId, before);
      default:
        throw new BadRequestException({
          code: "CONTENT_HISTORY_NOT_RESTORABLE",
          message: "该内容类型不能恢复。",
        });
    }
  }

  private async finishMasterDataUpdate<T>(
    result: MasterDataUpdateResult<T> | null,
  ): Promise<T> {
    if (!result) {
      throw new NotFoundException({
        code: "CONTENT_MASTER_DATA_NOT_FOUND",
        message: "主数据记录不存在。",
      });
    }
    await Promise.all(
      result.archivedObjectKeys.map((objectKey) =>
        this.objectStorage.deletePublicObject(objectKey),
      ),
    );
    await this.publicCatalogInvalidator.invalidate();
    return result.record;
  }

  async createSourceUpload(
    actorKey: string,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    const mimeType = String(raw.mimeType ?? "");
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new BadRequestException({
        code: "UNSUPPORTED_SOURCE_TYPE",
        message: "原帖图片仅支持 JPEG、PNG 或 WebP。",
      });
    }
    const sizeBytes = Number(raw.sizeBytes);
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (
      !Number.isInteger(sizeBytes) ||
      sizeBytes <= 0 ||
      sizeBytes > 50 * 1024 * 1024
    ) {
      throw new BadRequestException({
        code: "INVALID_SOURCE_SIZE",
        message: "原帖图片必须小于 50 MB。",
      });
    }
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 512 ||
      height < 512 ||
      width > 30_000 ||
      height > 30_000
    ) {
      throw new BadRequestException({
        code: "INVALID_SOURCE_DIMENSIONS",
        message: "原帖图片边长必须在 512 到 30000 像素之间。",
      });
    }
    const checksumSha256 = String(raw.checksumSha256 ?? "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(checksumSha256)) {
      throw new BadRequestException({
        code: "INVALID_SOURCE_CHECKSUM",
        message: "原帖图片缺少有效的 SHA-256 校验值。",
      });
    }
    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[mimeType];
    const objectKey = `content/sources/${randomUUID()}/source.${extension}`;
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1_000);
    const upload = await this.repository.createSourceUpload(actorKey, {
      checksumSha256,
      editionId: requiredUuid(raw.editionId, "版本"),
      expiresAt,
      height,
      mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
      now,
      objectKey,
      pageLabel: optionalText(raw.pageLabel, 100),
      rightsRecordId: requiredUuid(raw.rightsRecordId, "权利记录"),
      sizeBytes,
      width,
    });
    if (!upload) {
      throw new BadRequestException({
        code: "INACTIVE_CONTENT_REFERENCE",
        message: "版本或其上级主数据已停用，不能继续上传原帖。",
      });
    }
    if (upload.status === "DUPLICATE") {
      throw new BadRequestException({
        code: "DUPLICATE_SOURCE_IMAGE",
        details: { duplicateKind: upload.duplicateKind },
        message:
          upload.duplicateKind === "SOURCE_ASSET"
            ? "相同原帖图片已经入库，请直接使用已有来源资产。"
            : "相同原帖图片已有未过期上传任务，请等待或继续原任务。",
      });
    }
    const uploadUrl = await this.objectStorage.createUploadUrl({
      expiresInSeconds: 15 * 60,
      metadata: { sha256: checksumSha256 },
      mimeType,
      objectKey,
    });
    return {
      expiresAt: expiresAt.toISOString(),
      requiredHeaders: {
        "content-type": mimeType,
        "x-amz-meta-sha256": checksumSha256,
      },
      uploadId: upload.uploadId,
      uploadUrl,
    };
  }

  async completeSourceUpload(
    actorKey: string,
    uploadId: string,
    now: Date = new Date(),
  ) {
    const upload = await this.repository.findSourceUpload(uploadId, actorKey);
    if (!upload) {
      throw new NotFoundException({
        code: "SOURCE_UPLOAD_NOT_FOUND",
        message: "没有找到原帖上传任务。",
      });
    }
    if (upload.sourceAssetId) {
      return { sourceAssetId: upload.sourceAssetId };
    }
    if (upload.expiresAt <= now) {
      throw new BadRequestException({
        code: "SOURCE_UPLOAD_EXPIRED",
        message: "原帖上传地址已过期。",
      });
    }
    const stored = await this.objectStorage.headPrivateObject(upload.objectKey);
    if (
      !stored ||
      stored.contentLength !== upload.sizeBytes ||
      stored.contentType !== upload.mimeType ||
      stored.checksumSha256 !== upload.checksumSha256
    ) {
      throw new BadRequestException({
        code: "SOURCE_UPLOAD_MISMATCH",
        message: "原帖文件大小、格式或校验值与登记信息不一致。",
      });
    }
    return this.repository.completeSourceUpload(uploadId, actorKey, now);
  }

  listSourceAssets() {
    return this.repository.listSourceAssets();
  }

  async createSourceAssetView(sourceAssetId: string) {
    const source = await this.repository.findPrivateSourceAsset(
      requiredUuid(sourceAssetId, "原帖来源资产"),
    );
    if (!source) {
      throw new NotFoundException({ code: "SOURCE_ASSET_NOT_FOUND" });
    }
    return {
      expiresAt: new Date(Date.now() + 5 * 60 * 1_000).toISOString(),
      height: source.height,
      mimeType: source.mimeType,
      url: await this.objectStorage.createDownloadUrl({
        expiresInSeconds: 5 * 60,
        objectKey: source.objectKey,
      }),
      width: source.width,
    };
  }

  async acceptSegmentationCandidate(
    actorKey: string,
    candidateId: string,
    raw: Record<string, unknown>,
  ) {
    const id = requiredUuid(candidateId, "预切分候选框");
    const candidate = await this.repository.findSegmentationCandidate(id);
    if (!candidate || candidate.status !== "PENDING") {
      throw new BadRequestException({
        code: "SEGMENTATION_CANDIDATE_NOT_PENDING",
        message: "候选框不存在或已经处理。",
      });
    }
    return this.createGlyph(actorKey, {
      ...raw,
      bboxHeight: raw.bboxHeight ?? candidate.bboxHeight,
      bboxWidth: raw.bboxWidth ?? candidate.bboxWidth,
      bboxX: raw.bboxX ?? candidate.bboxX,
      bboxY: raw.bboxY ?? candidate.bboxY,
      segmentationCandidateId: id,
      sourceAssetId: candidate.sourceAssetId,
    });
  }

  async rejectSegmentationCandidate(
    actorKey: string,
    candidateId: string,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    const id = requiredUuid(candidateId, "预切分候选框");
    const note = requiredText(raw.note, "驳回原因", 1_000);
    if (
      !(await this.repository.rejectSegmentationCandidate(
        actorKey,
        id,
        note,
        now,
      ))
    ) {
      throw new BadRequestException({
        code: "SEGMENTATION_CANDIDATE_NOT_REJECTABLE",
        message: "候选框不存在或已被接受。",
      });
    }
    return { candidateId: id, status: "REJECTED" as const };
  }

  listSegmentationJobs() {
    return this.repository.listSegmentationJobs();
  }

  async createSegmentationJob(actorKey: string, sourceAssetId: string) {
    const created = await this.repository.createSegmentationJob(
      actorKey,
      requiredUuid(sourceAssetId, "原帖来源资产"),
    );
    if (!created || !created.mimeType || !created.sourceObjectKey) {
      throw new BadRequestException({
        code: "SOURCE_NOT_SEGMENTABLE",
        message: "原帖不存在，或其书家、作品、版本已停用。",
      });
    }
    if (created.status === "PENDING") {
      await this.processingQueue.enqueueSourceSegmentation({
        jobId: created.jobId,
        mimeType: created.mimeType,
        sourceObjectKey: created.sourceObjectKey,
      });
    }
    return {
      created: created.created,
      jobId: created.jobId,
      status: created.status,
    };
  }

  async markSegmentationProcessing(
    jobId: string,
    internalToken: string | undefined,
    now: Date = new Date(),
  ) {
    this.assertWorkerToken(internalToken);
    const id = requiredUuid(jobId, "预切分任务");
    if (!(await this.repository.markSegmentationProcessing(id, now))) {
      throw new NotFoundException({ code: "SEGMENTATION_JOB_NOT_FOUND" });
    }
    return { jobId: id, status: "PROCESSING" as const };
  }

  async recordSegmentationResult(
    jobId: string,
    internalToken: string | undefined,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    this.assertWorkerToken(internalToken);
    const algorithmVersion = requiredText(
      raw.algorithmVersion,
      "预切分算法版本",
      100,
    );
    if (!Array.isArray(raw.candidates) || raw.candidates.length > 500) {
      throw new BadRequestException({
        code: "INVALID_SEGMENTATION_RESULT",
        message: "预切分候选框结果无效。",
      });
    }
    const candidates = raw.candidates.map((value, sortOrder) => {
      if (!isRecord(value)) {
        throw new BadRequestException({ code: "INVALID_SEGMENTATION_RESULT" });
      }
      const candidate = {
        bboxHeight: Number(value.bboxHeight),
        bboxWidth: Number(value.bboxWidth),
        bboxX: Number(value.bboxX),
        bboxY: Number(value.bboxY),
        confidence: Number(value.confidence),
        sortOrder,
      };
      if (
        !Object.values(candidate).every(Number.isInteger) ||
        candidate.bboxX < 0 ||
        candidate.bboxY < 0 ||
        candidate.bboxWidth <= 0 ||
        candidate.bboxHeight <= 0 ||
        candidate.confidence < 0 ||
        candidate.confidence > 1_000
      ) {
        throw new BadRequestException({
          code: "INVALID_SEGMENTATION_RESULT",
          message: "预切分候选框坐标或置信度无效。",
        });
      }
      return candidate;
    });
    const id = requiredUuid(jobId, "预切分任务");
    if (
      !(await this.repository.recordSegmentationResult(
        id,
        algorithmVersion,
        candidates,
        now,
      ))
    ) {
      throw new BadRequestException({
        code: "SEGMENTATION_RESULT_REJECTED",
        message: "任务不存在，或候选框超出原帖范围。",
      });
    }
    return {
      candidateCount: candidates.length,
      jobId: id,
      status: "COMPLETED" as const,
    };
  }

  async recordSegmentationFailure(
    jobId: string,
    internalToken: string | undefined,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    this.assertWorkerToken(internalToken);
    const id = requiredUuid(jobId, "预切分任务");
    const failureCode = requiredText(raw.failureCode, "失败代码", 100);
    const failureMessage = sanitizeDiagnosticMessage(
      requiredText(raw.failureMessage, "失败信息", 1_000),
      1_000,
    );
    if (
      !(await this.repository.recordSegmentationFailure(
        id,
        failureCode,
        failureMessage,
        now,
      ))
    ) {
      throw new NotFoundException({ code: "SEGMENTATION_JOB_NOT_FOUND" });
    }
    return { jobId: id, status: "FAILED" as const };
  }

  private assertWorkerToken(internalToken: string | undefined): void {
    if (
      !process.env.INTERNAL_WORKER_TOKEN ||
      internalToken !== process.env.INTERNAL_WORKER_TOKEN
    ) {
      throw new UnauthorizedException({ code: "INVALID_WORKER_TOKEN" });
    }
  }

  listGlyphs() {
    return this.repository.listGlyphs();
  }

  async createGlyph(actorKey: string, raw: Record<string, unknown>) {
    const input = normalizeCreateGlyphInput(raw);
    const created = await this.repository.createGlyph(actorKey, input);
    if (!created) {
      throw new BadRequestException({
        code: "GLYPH_BBOX_OUT_OF_BOUNDS",
        message: "单字框超出原帖范围或来源资产不存在。",
      });
    }
    const outputObjectKey = `content/glyphs/${created.glyphId}/glyph.webp`;
    await this.processingQueue.enqueueGlyphCrop({
      bboxHeight: input.bboxHeight,
      bboxWidth: input.bboxWidth,
      bboxX: input.bboxX,
      bboxY: input.bboxY,
      glyphId: created.glyphId,
      mimeType: created.mimeType,
      outputObjectKey,
      sourceObjectKey: created.sourceObjectKey,
    });
    return { glyphId: created.glyphId, status: "PROCESSING" as const };
  }

  async recordGlyphCrop(
    glyphId: string,
    internalToken: string | undefined,
    raw: Record<string, unknown>,
  ) {
    if (
      !process.env.INTERNAL_WORKER_TOKEN ||
      internalToken !== process.env.INTERNAL_WORKER_TOKEN
    ) {
      throw new UnauthorizedException({ code: "INVALID_WORKER_TOKEN" });
    }
    const checksum = String(raw.checksum ?? "");
    const objectKey = String(raw.objectKey ?? "");
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (
      !/^[0-9a-f]{64}$/.test(checksum) ||
      objectKey !== `content/glyphs/${glyphId}/glyph.webp` ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new BadRequestException({
        code: "INVALID_GLYPH_CROP_RESULT",
        message: "裁切任务结果无效。",
      });
    }
    if (
      !(await this.repository.recordGlyphCrop(glyphId, {
        checksum,
        height,
        objectKey,
        width,
      }))
    ) {
      throw new NotFoundException({ code: "GLYPH_NOT_FOUND" });
    }
    return { glyphId, status: "NEEDS_REVIEW" as const };
  }

  async reviewGlyph(
    actorKey: string,
    glyphId: string,
    raw: Record<string, unknown>,
  ) {
    const decision = String(raw.decision ?? "");
    if (!new Set(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]).has(decision)) {
      throw new BadRequestException({ code: "INVALID_REVIEW_DECISION" });
    }
    const note =
      decision === "APPROVED"
        ? optionalText(raw.note, 2_000)
        : requiredText(raw.note, "驳回或修改原因", 2_000);
    const accepted = await this.repository.reviewGlyph(
      actorKey,
      requiredUuid(glyphId, "单字"),
      decision as "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
      note,
    );
    if (!accepted) {
      throw new BadRequestException({
        code: "GLYPH_REVIEW_NOT_ALLOWED",
        message:
          "仅待审核单字可复核，且最近录入或纠错人与审核人不能是同一账号。",
      });
    }
    return {
      glyphId,
      status:
        decision === "APPROVED"
          ? ("APPROVED" as const)
          : decision === "REJECTED"
            ? ("ARCHIVED" as const)
            : ("DRAFT" as const),
    };
  }

  async publishGlyph(
    actorKey: string,
    glyphId: string,
    now: Date = new Date(),
  ) {
    if (
      !(await this.repository.publishGlyph(
        actorKey,
        requiredUuid(glyphId, "单字"),
        now,
      ))
    ) {
      throw new BadRequestException({
        code: "GLYPH_NOT_PUBLISHABLE",
        message: "发布需要审核通过、公开权利有效且公开裁切图完整。",
      });
    }
    await this.publicCatalogInvalidator.invalidate();
    return { glyphId, status: "PUBLISHED" as const };
  }

  async unpublishGlyph(
    actorKey: string,
    glyphId: string,
    raw: Record<string, unknown>,
  ) {
    const id = requiredUuid(glyphId, "单字");
    const reason = requiredText(raw.reason, "下架原因", 2_000);
    const unpublished = await this.repository.unpublishGlyph(
      actorKey,
      id,
      reason,
    );
    if (!unpublished) {
      throw new BadRequestException({
        code: "GLYPH_NOT_UNPUBLISHABLE",
        message: "只有已发布单字可以下架。",
      });
    }
    await Promise.all(
      unpublished.objectKeys.map((objectKey) =>
        this.objectStorage.deletePublicObject(objectKey),
      ),
    );
    await this.publicCatalogInvalidator.invalidate();
    return { glyphId: id, status: "ARCHIVED" as const };
  }

  async updateGlyph(
    actorKey: string,
    glyphId: string,
    raw: Record<string, unknown>,
  ) {
    const input: UpdateGlyphInput = {};
    if (
      Object.hasOwn(raw, "character") ||
      Object.hasOwn(raw, "canonicalCharacter")
    ) {
      const character = hanCharacter(
        raw.canonicalCharacter ?? raw.character,
        "最终规范字",
      );
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined) throw new BadRequestException();
      input.character = character;
      input.unicodeCodePoint = `U+${codePoint
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")}`;
    }
    if (
      Object.hasOwn(raw, "observedCharacter") ||
      Object.hasOwn(raw, "character")
    ) {
      input.observedCharacter = hanCharacter(
        raw.observedCharacter ?? raw.character,
        "原帖字",
      );
    }
    if (
      Object.hasOwn(raw, "characterCandidates") ||
      Object.hasOwn(raw, "labelCandidates")
    ) {
      if (!input.observedCharacter) {
        throw new BadRequestException({
          code: "OBSERVED_CHARACTER_REQUIRED",
          message: "修改字符候选时必须同时提交原帖字。",
        });
      }
      input.labelCandidates = labelCandidates(
        raw.characterCandidates ?? raw.labelCandidates,
        input.observedCharacter,
      );
    }
    if (Object.hasOwn(raw, "transcription")) {
      input.transcription = optionalText(raw.transcription, 10_000);
    }
    if (Object.hasOwn(raw, "variantType")) {
      input.variantType = glyphVariantType(raw.variantType, false);
    }
    if (Object.hasOwn(raw, "authenticityGrade")) {
      const grade = String(raw.authenticityGrade ?? "");
      if (
        ![
          "A_ORIGINAL",
          "B_RUBBING_OR_AUTHORIZED_EDITION",
          "C_MODERN_COPY",
        ].includes(grade)
      ) {
        throw new BadRequestException({
          code: "INVALID_AUTHENTICITY_GRADE",
          message: "真实性等级无效；AI 生成内容不能进入名家字库。",
        });
      }
      input.authenticityGrade = grade as UpdateGlyphInput["authenticityGrade"];
    }

    const numberRules = {
      bboxHeight: (value: number) => value > 0,
      bboxWidth: (value: number) => value > 0,
      bboxX: (value: number) => value >= 0,
      bboxY: (value: number) => value >= 0,
      beginnerWeight: (value: number) => value >= 0 && value <= 100,
      imageQuality: (value: number) => value >= 0 && value <= 100,
    } satisfies Record<
      keyof Pick<
        UpdateGlyphInput,
        | "bboxHeight"
        | "bboxWidth"
        | "bboxX"
        | "bboxY"
        | "beginnerWeight"
        | "imageQuality"
      >,
      (value: number) => boolean
    >;
    for (const [field, isValid] of Object.entries(numberRules) as Array<
      [keyof typeof numberRules, (value: number) => boolean]
    >) {
      if (!Object.hasOwn(raw, field)) continue;
      const value = Number(raw[field]);
      if (!Number.isInteger(value) || !isValid(value)) {
        throw new BadRequestException({
          code: "INVALID_GLYPH_BBOX",
          message: "单字框或质量权重无效。",
        });
      }
      input[field] = value;
    }
    if (Object.keys(input).length === 0) {
      throw new BadRequestException({
        code: "EMPTY_GLYPH_CORRECTION",
        message: "至少提交一个需要纠正的单字字段。",
      });
    }

    const id = requiredUuid(glyphId, "单字");
    const updated = await this.repository.updateGlyph(actorKey, id, input);
    if (!updated) {
      throw new BadRequestException({
        code: "GLYPH_CORRECTION_NOT_ALLOWED",
        message: "已发布或处理中的单字不能直接纠正，或新单字框超出原帖范围。",
      });
    }
    if (updated.cropJob) {
      await this.processingQueue.enqueueGlyphCrop({
        ...updated.cropJob,
        glyphId: id,
        outputObjectKey: `content/glyphs/${id}/glyph.webp`,
      });
    }
    return { glyphId: id, status: updated.status };
  }

  async updateCalligrapher(
    actorKey: string,
    calligrapherId: string,
    raw: Record<string, unknown>,
  ) {
    const input: UpdateCalligrapherInput = {};
    if (Object.hasOwn(raw, "name"))
      input.name = requiredText(raw.name, "书家姓名", 100);
    if (Object.hasOwn(raw, "dynasty"))
      input.dynasty = requiredText(raw.dynasty, "朝代", 64);
    if (Object.hasOwn(raw, "biography"))
      input.biography = optionalText(raw.biography, 10_000);
    if (Object.hasOwn(raw, "isActive"))
      input.isActive = requiredBoolean(raw.isActive, "启用状态");
    if (Object.keys(input).length === 0) {
      throw new BadRequestException({
        code: "EMPTY_MASTER_DATA_UPDATE",
        message: "至少提交一个需要修改的字段。",
      });
    }
    return this.finishMasterDataUpdate(
      await this.repository.updateCalligrapher(
        actorKey,
        requiredUuid(calligrapherId, "书家"),
        input,
      ),
    );
  }

  async updateWork(
    actorKey: string,
    workId: string,
    raw: Record<string, unknown>,
  ) {
    const input: UpdateWorkInput = {};
    if (Object.hasOwn(raw, "title"))
      input.title = requiredText(raw.title, "作品名称", 200);
    if (Object.hasOwn(raw, "dynasty"))
      input.dynasty = requiredText(raw.dynasty, "作品朝代", 64);
    if (Object.hasOwn(raw, "description"))
      input.description = optionalText(raw.description, 10_000);
    if (Object.hasOwn(raw, "isActive"))
      input.isActive = requiredBoolean(raw.isActive, "启用状态");
    if (Object.keys(input).length === 0) {
      throw new BadRequestException({
        code: "EMPTY_MASTER_DATA_UPDATE",
        message: "至少提交一个需要修改的字段。",
      });
    }
    return this.finishMasterDataUpdate(
      await this.repository.updateWork(
        actorKey,
        requiredUuid(workId, "作品"),
        input,
      ),
    );
  }

  async updateEdition(
    actorKey: string,
    editionId: string,
    raw: Record<string, unknown>,
  ) {
    const input: UpdateEditionInput = {};
    if (Object.hasOwn(raw, "name"))
      input.name = requiredText(raw.name, "版本名称", 200);
    if (Object.hasOwn(raw, "holdingInstitution"))
      input.holdingInstitution = optionalText(raw.holdingInstitution, 200);
    if (Object.hasOwn(raw, "publication"))
      input.publication = optionalText(raw.publication, 300);
    if (Object.hasOwn(raw, "sourceUrl"))
      input.sourceUrl = optionalText(raw.sourceUrl, 2_000);
    if (Object.hasOwn(raw, "isActive"))
      input.isActive = requiredBoolean(raw.isActive, "启用状态");
    if (Object.keys(input).length === 0) {
      throw new BadRequestException({
        code: "EMPTY_MASTER_DATA_UPDATE",
        message: "至少提交一个需要修改的字段。",
      });
    }
    return this.finishMasterDataUpdate(
      await this.repository.updateEdition(
        actorKey,
        requiredUuid(editionId, "版本"),
        input,
      ),
    );
  }

  async updateRights(
    actorKey: string,
    rightsId: string,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    const input: UpdateRightsInput = {};
    if (Object.hasOwn(raw, "status")) {
      const status = String(raw.status ?? "");
      if (
        ![
          "INTERNAL_TEST_ONLY",
          "CLEARED_PUBLIC",
          "RESTRICTED",
          "EXPIRED",
        ].includes(status)
      ) {
        throw new BadRequestException({
          code: "INVALID_RIGHTS_STATUS",
          message: "权利状态无效。",
        });
      }
      input.status = status as UpdateRightsInput["status"];
    }
    if (Object.hasOwn(raw, "sourceName"))
      input.sourceName = requiredText(raw.sourceName, "来源名称", 200);
    if (Object.hasOwn(raw, "sourceUrl"))
      input.sourceUrl = optionalText(raw.sourceUrl, 2_000);
    if (Object.hasOwn(raw, "licenseName"))
      input.licenseName = optionalText(raw.licenseName, 200);
    if (Object.hasOwn(raw, "attributionText"))
      input.attributionText = optionalText(raw.attributionText, 1_000);
    if (Object.hasOwn(raw, "allowCommercial"))
      input.allowCommercial = requiredBoolean(
        raw.allowCommercial,
        "商业使用状态",
      );
    if (Object.hasOwn(raw, "maxPublicWidth"))
      input.maxPublicWidth = nullablePositiveInteger(
        raw.maxPublicWidth,
        "公开最大宽度",
      );
    if (Object.hasOwn(raw, "validFrom"))
      input.validFrom = nullableDate(raw.validFrom, "授权生效日期");
    if (Object.hasOwn(raw, "validUntil"))
      input.validUntil = nullableDate(raw.validUntil, "授权截止日期");
    if (Object.hasOwn(raw, "notes"))
      input.notes = optionalText(raw.notes, 10_000);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException({
        code: "EMPTY_MASTER_DATA_UPDATE",
        message: "至少提交一个需要修改的字段。",
      });
    }
    return this.finishMasterDataUpdate(
      await this.repository.updateRights(
        actorKey,
        requiredUuid(rightsId, "权利记录"),
        input,
        now,
      ),
    );
  }

  createCalligrapher(actorKey: string, raw: Record<string, unknown>) {
    return this.repository.createCalligrapher(actorKey, {
      biography: optionalText(raw.biography, 10_000),
      dynasty: requiredText(raw.dynasty, "朝代", 64),
      name: requiredText(raw.name, "书家姓名", 100),
    });
  }

  async createWork(actorKey: string, raw: Record<string, unknown>) {
    const created = await this.repository.createWork(actorKey, {
      calligrapherId: requiredUuid(raw.calligrapherId, "书家"),
      description: optionalText(raw.description, 10_000),
      dynasty: requiredText(raw.dynasty, "作品朝代", 64),
      title: requiredText(raw.title, "作品名称", 200),
    });
    if (!created) {
      throw new BadRequestException({
        code: "INACTIVE_CONTENT_REFERENCE",
        message: "书家已停用，不能新增作品。",
      });
    }
    return created;
  }

  async createEdition(actorKey: string, raw: Record<string, unknown>) {
    const created = await this.repository.createEdition(actorKey, {
      holdingInstitution: optionalText(raw.holdingInstitution, 200),
      name: requiredText(raw.name, "版本名称", 200),
      publication: optionalText(raw.publication, 300),
      sourceUrl: optionalText(raw.sourceUrl, 2_000),
      workId: requiredUuid(raw.workId, "作品"),
    });
    if (!created) {
      throw new BadRequestException({
        code: "INACTIVE_CONTENT_REFERENCE",
        message: "作品或书家已停用，不能新增版本。",
      });
    }
    return created;
  }

  createRights(actorKey: string, raw: Record<string, unknown>) {
    const status = raw.status;
    if (
      !new Set(["INTERNAL_TEST_ONLY", "CLEARED_PUBLIC", "RESTRICTED"]).has(
        String(status),
      )
    ) {
      throw new BadRequestException({
        code: "INVALID_RIGHTS_STATUS",
        message: "权利状态无效。",
      });
    }
    const validUntil = optionalText(raw.validUntil, 40);
    const parsedValidUntil = validUntil ? new Date(validUntil) : null;
    if (parsedValidUntil && Number.isNaN(parsedValidUntil.getTime())) {
      throw new BadRequestException({
        code: "INVALID_RIGHTS_DATE",
        message: "授权截止日期无效。",
      });
    }
    return this.repository.createRights(actorKey, {
      allowCommercial: raw.allowCommercial === true,
      attributionText: optionalText(raw.attributionText, 1_000),
      licenseName: optionalText(raw.licenseName, 200),
      maxPublicWidth: nullablePositiveInteger(
        raw.maxPublicWidth,
        "公开最大宽度",
      ),
      notes: optionalText(raw.notes, 10_000),
      sourceName: requiredText(raw.sourceName, "来源名称", 200),
      sourceUrl: optionalText(raw.sourceUrl, 2_000),
      status: status as "INTERNAL_TEST_ONLY" | "CLEARED_PUBLIC" | "RESTRICTED",
      validFrom: nullableDate(raw.validFrom ?? null, "授权生效日期"),
      validUntil: parsedValidUntil,
    });
  }
}
