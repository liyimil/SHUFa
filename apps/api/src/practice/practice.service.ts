import { createHash, randomBytes } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
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
import { PrivacyService } from "../privacy/privacy.service.js";
import {
  ARTWORK_DELETION_QUEUE,
  type ArtworkDeletionQueue,
} from "./artwork-deletion.queue.js";
import {
  PRACTICE_REPOSITORY,
  type PracticeRepository,
} from "./practice.repository.js";
import {
  PRACTICE_ANALYSIS_QUEUE,
  type PracticeAnalysisQueue,
} from "./practice-analysis.queue.js";
import type {
  PracticeAnalysisProvenance,
  PracticeRecord,
  PracticeView,
} from "./practice.types.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new BadRequestException({
      code: "INVALID_PRACTICE_REFERENCE",
      message: `${field}无效。`,
    });
  }
  return value;
}

function favoriteGroupName(value: unknown): string {
  const name = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!name || name.length > 40) {
    throw new BadRequestException({ code: "INVALID_FAVORITE_GROUP_NAME" });
  }
  return name;
}

function reorderDirection(value: unknown): "UP" | "DOWN" {
  if (value !== "UP" && value !== "DOWN") {
    throw new BadRequestException({ code: "INVALID_REORDER_DIRECTION" });
  }
  return value;
}

function publicAssetUrl(objectKey: string): string {
  const base = (
    process.env.PUBLIC_ASSET_BASE_URL ??
    "http://localhost:9000/calligraphy-public"
  ).replace(/\/$/, "");
  return `${base}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

function validStructureMetrics(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const metrics = value as Record<string, unknown>;
  const unitFields = [
    "bbox_height_ratio",
    "bbox_left_ratio",
    "bbox_top_ratio",
    "bbox_width_ratio",
    "centroid_x",
    "centroid_y",
    "confidence",
    "foreground_ratio",
  ];
  if (
    !unitFields.every(
      (field) =>
        typeof metrics[field] === "number" &&
        Number.isFinite(metrics[field]) &&
        (metrics[field] as number) >= 0 &&
        (metrics[field] as number) <= 1,
    ) ||
    typeof metrics.ink_aspect_ratio !== "number" ||
    !Number.isFinite(metrics.ink_aspect_ratio) ||
    metrics.ink_aspect_ratio <= 0 ||
    !Array.isArray(metrics.anomalies) ||
    metrics.anomalies.length > 5 ||
    metrics.anomalies.some(
      (item) =>
        ![
          "NO_FOREGROUND",
          "TOO_SPARSE",
          "TOO_DENSE",
          "TOUCHES_EDGE",
          "FRAGMENTED_FOREGROUND",
        ].includes(String(item)),
    ) ||
    !validNormalization(metrics.normalization) ||
    !validSpatialDistribution(metrics.spatial_distribution)
  ) {
    return false;
  }
  return (
    (metrics.bbox_left_ratio as number) +
      (metrics.bbox_width_ratio as number) <=
      1.001 &&
    (metrics.bbox_top_ratio as number) +
      (metrics.bbox_height_ratio as number) <=
      1.001
  );
}

function validNormalization(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const transform = value as Record<string, unknown>;
  const validFields =
    transform.version === "glyph-normalization-v1" &&
    transform.canvas_height === 512 &&
    transform.canvas_width === 512 &&
    Number.isInteger(transform.offset_x) &&
    Number(transform.offset_x) >= 0 &&
    Number.isInteger(transform.offset_y) &&
    Number(transform.offset_y) >= 0 &&
    Number.isInteger(transform.source_height) &&
    Number(transform.source_height) > 0 &&
    Number.isInteger(transform.source_width) &&
    Number(transform.source_width) > 0 &&
    typeof transform.scale === "number" &&
    Number.isFinite(transform.scale) &&
    transform.scale > 0;
  if (!validFields) return false;
  const scaledWidth = Math.round(
    Number(transform.source_width) * Number(transform.scale),
  );
  const scaledHeight = Math.round(
    Number(transform.source_height) * Number(transform.scale),
  );
  return (
    scaledWidth > 0 &&
    scaledHeight > 0 &&
    Number(transform.offset_x) + scaledWidth <= 512 &&
    Number(transform.offset_y) + scaledHeight <= 512
  );
}

function validSpatialDistribution(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const distribution = value as Record<string, unknown>;
  const fields = ["bottom_left", "bottom_right", "top_left", "top_right"];
  const validFields = fields.every(
    (field) =>
      typeof distribution[field] === "number" &&
      Number.isFinite(distribution[field]) &&
      (distribution[field] as number) >= 0 &&
      (distribution[field] as number) <= 1,
  );
  if (!validFields) return false;
  const total = fields.reduce(
    (sum, field) => sum + Number(distribution[field]),
    0,
  );
  return total === 0 || (total >= 0.999 && total <= 1.001);
}

function validSuggestionText(value: unknown): boolean {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 500
  );
}

function readProvenance(value: unknown): PracticeAnalysisProvenance | null {
  if (!value || typeof value !== "object") return null;
  const provenance = value as Record<string, unknown>;
  const text = (field: string, maximum: number): string | null => {
    const candidate = provenance[field];
    return typeof candidate === "string" &&
      candidate.length > 0 &&
      candidate.length <= maximum
      ? candidate
      : null;
  };
  const parsed = {
    masterChecksumSha256: text("masterChecksumSha256", 64),
    masterObjectKey: text("masterObjectKey", 1_000),
    measurementVersion: text("measurementVersion", 100),
    modelVersion: text("modelVersion", 100),
    normalizationVersion: text("normalizationVersion", 100),
    ruleVersion: text("ruleVersion", 100),
    userChecksumSha256: text("userChecksumSha256", 64),
    userObjectKey: text("userObjectKey", 1_000),
  };
  if (
    !parsed.masterChecksumSha256 ||
    !parsed.masterObjectKey ||
    !parsed.measurementVersion ||
    !parsed.modelVersion ||
    !parsed.normalizationVersion ||
    !parsed.ruleVersion ||
    !parsed.userChecksumSha256 ||
    !parsed.userObjectKey ||
    !/^[a-f0-9]{64}$/.test(parsed.masterChecksumSha256) ||
    !/^[a-f0-9]{64}$/.test(parsed.userChecksumSha256) ||
    !parsed.masterObjectKey.startsWith("content/") ||
    !parsed.userObjectKey.startsWith("users/")
  ) {
    return null;
  }
  return parsed as PracticeAnalysisProvenance;
}

function assertWorkerToken(internalToken: string | undefined): void {
  if (
    !process.env.INTERNAL_WORKER_TOKEN ||
    internalToken !== process.env.INTERNAL_WORKER_TOKEN
  ) {
    throw new UnauthorizedException({ code: "INVALID_WORKER_TOKEN" });
  }
}

@Injectable()
export class PracticeService {
  constructor(
    @Inject(PRACTICE_REPOSITORY)
    private readonly repository: PracticeRepository,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    @Inject(PRACTICE_ANALYSIS_QUEUE)
    private readonly analysisQueue: PracticeAnalysisQueue,
    @Inject(ARTWORK_DELETION_QUEUE)
    private readonly artworkDeletionQueue: ArtworkDeletionQueue,
    @Inject(PrivacyService) private readonly privacyService: PrivacyService,
  ) {}

  async createPractice(
    userId: string,
    raw: Record<string, unknown>,
  ): Promise<PracticeView> {
    const result = await this.repository.createPractice(
      userId,
      uuid(raw.artworkId, "作品"),
      uuid(raw.glyphId, "范字"),
    );
    if (!result) {
      throw new BadRequestException({
        code: "PRACTICE_NOT_CREATABLE",
        message: "作品必须质检通过、确认文字，并选择同字且已发布的范字。",
      });
    }
    await this.scheduleAnalysis(result);
    return this.toView(result);
  }

  async addAttempt(
    userId: string,
    sessionId: string,
    raw: Record<string, unknown>,
  ) {
    const result = await this.repository.addAttempt(
      userId,
      uuid(sessionId, "练习记录"),
      uuid(raw.artworkId, "作品"),
    );
    if (!result) {
      throw new BadRequestException({
        code: "ATTEMPT_NOT_CREATABLE",
        message: "新作品必须属于本人、质检通过且与练习汉字一致。",
      });
    }
    await this.scheduleAnalysis(result);
    return this.toView(result);
  }

  async switchGlyph(
    userId: string,
    sessionId: string,
    raw: Record<string, unknown>,
  ): Promise<PracticeView> {
    const result = await this.repository.switchPracticeGlyph(
      userId,
      uuid(sessionId, "练习记录"),
      uuid(raw.glyphId, "范字"),
    );
    if (!result) {
      throw new BadRequestException({
        code: "GLYPH_NOT_SWITCHABLE",
        message:
          "练习记录不存在或范字不符合切换条件（须同字、已发布、权利有效）。",
      });
    }
    await this.scheduleAnalysis(result);
    return this.toView(result);
  }

  async listPractices(userId: string) {
    const records = await this.repository.listPractices(userId);
    await Promise.all(records.map((record) => this.scheduleAnalysis(record)));
    return Promise.all(records.map((record) => this.toView(record)));
  }

  async getPractice(userId: string, sessionId: string) {
    const record = await this.repository.findOwnedPractice(
      userId,
      uuid(sessionId, "练习记录"),
    );
    if (!record) throw new NotFoundException({ code: "PRACTICE_NOT_FOUND" });
    await this.scheduleAnalysis(record);
    return this.toView(record);
  }

  async favorite(
    userId: string,
    glyphId: string,
    raw: Record<string, unknown> = {},
    now: Date = new Date(),
  ) {
    const groupId = Object.hasOwn(raw, "groupId")
      ? raw.groupId === null
        ? null
        : uuid(raw.groupId, "收藏分组")
      : undefined;
    if (
      !(await this.repository.createFavorite(
        userId,
        uuid(glyphId, "范字"),
        groupId,
        now,
      ))
    ) {
      throw new NotFoundException({
        code: "GLYPH_NOT_FAVORITABLE",
        message: "范字不存在、未发布或公开权利已失效。",
      });
    }
    return { glyphId, favorite: true };
  }

  listFavorites(userId: string, now: Date = new Date()) {
    return this.repository.listFavorites(userId, now);
  }

  async createFavoriteGroup(userId: string, raw: Record<string, unknown>) {
    const group = await this.repository.createFavoriteGroup(
      userId,
      favoriteGroupName(raw.name),
    );
    if (!group) {
      throw new ConflictException({ code: "FAVORITE_GROUP_EXISTS" });
    }
    return group;
  }

  async updateFavoriteGroup(
    userId: string,
    groupId: string,
    raw: Record<string, unknown>,
  ) {
    const id = uuid(groupId, "收藏分组");
    const name = favoriteGroupName(raw.name);
    if (!(await this.repository.updateFavoriteGroup(userId, id, name))) {
      throw new BadRequestException({ code: "FAVORITE_GROUP_NOT_UPDATABLE" });
    }
    return { id, name };
  }

  async removeFavoriteGroup(userId: string, groupId: string) {
    const id = uuid(groupId, "收藏分组");
    if (!(await this.repository.removeFavoriteGroup(userId, id))) {
      throw new NotFoundException({ code: "FAVORITE_GROUP_NOT_FOUND" });
    }
    return { deleted: true, id };
  }

  async reorderFavorite(
    userId: string,
    glyphId: string,
    raw: Record<string, unknown>,
  ) {
    const id = uuid(glyphId, "范字");
    if (
      !(await this.repository.reorderFavorite(
        userId,
        id,
        reorderDirection(raw.direction),
      ))
    ) {
      throw new NotFoundException({ code: "FAVORITE_NOT_FOUND" });
    }
    return { glyphId: id, reordered: true };
  }

  async reorderFavoriteGroup(
    userId: string,
    groupId: string,
    raw: Record<string, unknown>,
  ) {
    const id = uuid(groupId, "收藏分组");
    if (
      !(await this.repository.reorderFavoriteGroup(
        userId,
        id,
        reorderDirection(raw.direction),
      ))
    ) {
      throw new NotFoundException({ code: "FAVORITE_GROUP_NOT_FOUND" });
    }
    return { groupId: id, reordered: true };
  }

  async unfavorite(userId: string, glyphId: string) {
    await this.repository.removeFavorite(userId, uuid(glyphId, "范字"));
    return { glyphId, favorite: false };
  }

  async createShare(userId: string, sessionId: string, now: Date = new Date()) {
    await this.privacyService.assertPublicSharingAllowed(userId);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
    const share = await this.repository.createShare(
      userId,
      uuid(sessionId, "练习记录"),
      tokenHash,
      expiresAt,
    );
    if (!share) throw new NotFoundException({ code: "PRACTICE_NOT_FOUND" });
    const webBase = (
      process.env.PUBLIC_WEB_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    return {
      expiresAt: expiresAt.toISOString(),
      id: share.id,
      url: `${webBase}/shares/${token}`,
    };
  }

  async getPublicShare(token: string, now: Date = new Date()) {
    return this.toView(await this.findPublicShareRecord(token, now));
  }

  async getPublicShareSummary(token: string, now: Date = new Date()) {
    const record = await this.findPublicShareRecord(token, now);
    return {
      attemptCount: record.attempts.length,
      character: record.character,
      master: {
        calligrapherName: record.master.calligrapherName,
        workTitle: record.master.workTitle,
      },
    };
  }

  private async findPublicShareRecord(token: string, now: Date) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      throw new NotFoundException({ code: "SHARE_NOT_FOUND" });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const record = await this.repository.findPublicShare(tokenHash, now);
    if (!record) throw new NotFoundException({ code: "SHARE_NOT_FOUND" });
    return record;
  }

  async revokeShare(userId: string, shareId: string, now: Date = new Date()) {
    if (
      !(await this.repository.revokeShare(userId, uuid(shareId, "分享"), now))
    ) {
      throw new NotFoundException({ code: "SHARE_NOT_FOUND" });
    }
    return { revoked: true, shareId };
  }

  async deleteArtwork(
    userId: string,
    artworkId: string,
    now: Date = new Date(),
  ) {
    const id = uuid(artworkId, "作品");
    const deletion = await this.repository.requestArtworkDeletion(
      userId,
      id,
      now,
    );
    if (!deletion) {
      throw new NotFoundException({ code: "ARTWORK_NOT_FOUND" });
    }
    let status: "DELETION_PENDING" | "DELETED" | "FAILED" =
      deletion.status === "COMPLETED" ? "DELETED" : "DELETION_PENDING";
    let updatedAt = deletion.updatedAt;
    if (deletion.status === "PENDING") {
      try {
        await this.artworkDeletionQueue.enqueue({
          artworkId: deletion.artworkId,
          attemptNumber: deletion.attemptNumber,
          deletionId: deletion.deletionId,
          objectKey: deletion.objectKey,
        });
      } catch (error: unknown) {
        const failureMessage = sanitizeDiagnosticMessage(error, 2_000);
        const failedAt = new Date();
        const failed = await this.repository.failArtworkDeletion({
          attemptNumber: deletion.attemptNumber,
          deletionId: deletion.deletionId,
          failureCode: "ARTWORK_DELETION_QUEUE_FAILED",
          failureMessage,
          now: failedAt,
          objectKey: deletion.objectKey,
        });
        if (!failed) throw error;
        status = "FAILED";
        updatedAt = failedAt;
      }
    }
    return {
      artworkId: deletion.artworkId,
      deletionId: deletion.deletionId,
      status,
      updatedAt: updatedAt.toISOString(),
    };
  }

  async getArtworkDeletion(userId: string, deletionId: string) {
    const deletion = await this.repository.findOwnedArtworkDeletion(
      userId,
      uuid(deletionId, "删除任务"),
    );
    if (!deletion) {
      throw new NotFoundException({ code: "ARTWORK_DELETION_NOT_FOUND" });
    }
    return deletion;
  }

  async completeArtworkDeletion(
    deletionId: string,
    internalToken: string | undefined,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    assertWorkerToken(internalToken);
    const attemptNumber = Number(raw.attemptNumber);
    const objectKey = String(raw.objectKey ?? "");
    if (
      !Number.isInteger(attemptNumber) ||
      attemptNumber < 1 ||
      !objectKey.startsWith("users/") ||
      objectKey.length > 1_000
    ) {
      throw new BadRequestException({ code: "INVALID_ARTWORK_DELETION" });
    }
    const id = uuid(deletionId, "删除任务");
    const completed = await this.repository.completeArtworkDeletion({
      attemptNumber,
      deletionId: id,
      now,
      objectKey,
    });
    if (!completed) {
      throw new NotFoundException({ code: "ARTWORK_DELETION_NOT_FOUND" });
    }
    return { deletionId: id, status: "DELETED" as const };
  }

  async failArtworkDeletion(
    deletionId: string,
    internalToken: string | undefined,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    assertWorkerToken(internalToken);
    const attemptNumber = Number(raw.attemptNumber);
    const failureCode = String(raw.failureCode ?? "");
    const rawFailureMessage = String(raw.failureMessage ?? "").trim();
    const objectKey = String(raw.objectKey ?? "");
    if (
      !Number.isInteger(attemptNumber) ||
      attemptNumber < 1 ||
      failureCode !== "ARTWORK_PHYSICAL_DELETION_FAILED" ||
      !rawFailureMessage ||
      rawFailureMessage.length > 2_000 ||
      !objectKey.startsWith("users/") ||
      objectKey.length > 1_000
    ) {
      throw new BadRequestException({
        code: "INVALID_ARTWORK_DELETION_FAILURE",
      });
    }
    const id = uuid(deletionId, "删除任务");
    const failureMessage = sanitizeDiagnosticMessage(rawFailureMessage, 2_000);
    const failed = await this.repository.failArtworkDeletion({
      attemptNumber,
      deletionId: id,
      failureCode,
      failureMessage,
      now,
      objectKey,
    });
    if (!failed) {
      throw new NotFoundException({ code: "ARTWORK_DELETION_NOT_FOUND" });
    }
    return { deletionId: id, status: "FAILED" as const };
  }

  async recordAdvice(
    attemptId: string,
    internalToken: string | undefined,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    assertWorkerToken(internalToken);
    const result =
      raw.result && typeof raw.result === "object"
        ? (raw.result as Record<string, unknown>)
        : null;
    const provenance = readProvenance(raw.provenance);
    if (
      !result ||
      !provenance ||
      result.advanced_analysis_status !==
        "UNAVAILABLE_NO_VALIDATED_CHARACTER_RULE" ||
      result.measurement_version !== "structure-measurement-v2" ||
      result.model_version !== "no-ml-geometry-v1" ||
      result.normalization_version !== "glyph-normalization-v1" ||
      result.threshold_version !== "structure-v1" ||
      !["OK", "LOW_CONFIDENCE"].includes(String(result.status)) ||
      !validStructureMetrics(result.user) ||
      !validStructureMetrics(result.master) ||
      !Array.isArray(result.suggestions) ||
      result.suggestions.length > 3 ||
      result.suggestions.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          !validSuggestionText((item as Record<string, unknown>).phenomenon) ||
          !validSuggestionText((item as Record<string, unknown>).evidence) ||
          !validSuggestionText((item as Record<string, unknown>).action) ||
          !["CENTER_X", "CENTER_Y", "PROPORTION"].includes(
            String((item as Record<string, unknown>).code),
          ),
      ) ||
      (result.status === "LOW_CONFIDENCE" && result.suggestions.length > 0) ||
      (result.status === "OK" &&
        Math.min(
          Number((result.user as Record<string, unknown>).confidence),
          Number((result.master as Record<string, unknown>).confidence),
        ) < 0.5) ||
      (result.status === "LOW_CONFIDENCE" &&
        Math.min(
          Number((result.user as Record<string, unknown>).confidence),
          Number((result.master as Record<string, unknown>).confidence),
        ) >= 0.5) ||
      provenance.measurementVersion !== result.measurement_version ||
      provenance.modelVersion !== result.model_version ||
      provenance.normalizationVersion !== result.normalization_version ||
      provenance.ruleVersion !== result.threshold_version
    ) {
      throw new BadRequestException({ code: "INVALID_STRUCTURE_ADVICE" });
    }
    if (
      !(await this.repository.recordAdvice(
        uuid(attemptId, "练习次数"),
        result,
        provenance,
        now,
      ))
    ) {
      throw new NotFoundException({ code: "ATTEMPT_NOT_FOUND" });
    }
    return { attemptId, status: "READY" as const };
  }

  async recordAdviceFailure(
    attemptId: string,
    internalToken: string | undefined,
    raw: Record<string, unknown>,
  ) {
    assertWorkerToken(internalToken);
    const failureCode = String(raw.failureCode ?? "");
    const rawFailureMessage = String(raw.failureMessage ?? "").trim();
    const masterObjectKey = String(raw.masterObjectKey ?? "");
    const userObjectKey = String(raw.userObjectKey ?? "");
    if (
      failureCode !== "STRUCTURE_ANALYSIS_FAILED" ||
      !rawFailureMessage ||
      rawFailureMessage.length > 2_000 ||
      !masterObjectKey.startsWith("content/") ||
      masterObjectKey.length > 1_000 ||
      !userObjectKey.startsWith("users/") ||
      userObjectKey.length > 1_000
    ) {
      throw new BadRequestException({ code: "INVALID_ANALYSIS_FAILURE" });
    }
    const failureMessage = sanitizeDiagnosticMessage(rawFailureMessage, 2_000);
    const recorded = await this.repository.recordAnalysisFailure({
      attemptId: uuid(attemptId, "练习次数"),
      failureCode,
      failureMessage,
      masterObjectKey,
      userObjectKey,
    });
    if (!recorded) {
      throw new NotFoundException({ code: "ANALYSIS_RUN_NOT_FOUND" });
    }
    return { attemptId, status: "FAILED" as const };
  }

  private async toView(record: PracticeRecord): Promise<PracticeView> {
    return {
      attempts: await Promise.all(
        record.attempts.map(async (attempt) => ({
          advice: attempt.advice,
          analysis: attempt.analysis,
          artworkId: attempt.artworkId,
          createdAt: attempt.createdAt.toISOString(),
          imageUrl: await this.objectStorage.createDownloadUrl({
            expiresInSeconds: 5 * 60,
            objectKey: attempt.objectKey,
          }),
          sequence: attempt.sequence,
        })),
      ),
      character: record.character,
      createdAt: record.createdAt.toISOString(),
      id: record.id,
      master: {
        calligrapherName: record.master.calligrapherName,
        glyphId: record.master.glyphId,
        imageUrl: record.master.imageObjectKey
          ? publicAssetUrl(record.master.imageObjectKey)
          : null,
        workTitle: record.master.workTitle,
      },
    };
  }

  private async scheduleAnalysis(record: PracticeRecord): Promise<void> {
    if (!record.master.imageObjectKey) return;
    await Promise.all(
      record.attempts
        .filter(
          (attempt) =>
            attempt.advice === null && attempt.analysis?.status !== "FAILED",
        )
        .map(async (attempt) => {
          try {
            await this.repository.prepareAnalysisRun({
              attemptId: attempt.attemptId,
              masterObjectKey: record.master.imageObjectKey!,
              userObjectKey: attempt.objectKey,
            });
            await this.analysisQueue.enqueue({
              attemptId: attempt.attemptId,
              masterObjectKey: record.master.imageObjectKey!,
              userMimeType: attempt.mimeType,
              userObjectKey: attempt.objectKey,
            });
          } catch (error: unknown) {
            console.error(
              JSON.stringify({
                attemptId: attempt.attemptId,
                error: sanitizeDiagnosticMessage(error),
                event: "practice_analysis_enqueue_failed",
              }),
            );
          }
        }),
    );
  }
}
