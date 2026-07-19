import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { OBJECT_STORAGE, type ObjectStorage } from "./object-storage.js";
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from "./upload.repository.js";
import {
  allowedArtworkMimeTypes,
  type ArtworkMimeType,
  type CancelUploadResult,
  type CompleteUploadResult,
  type CreateUploadInput,
  type CreateUploadResult,
} from "./upload.types.js";
import {
  MAX_ARTWORK_PIXELS,
  UploadedImageValidationError,
  validateUploadedImage,
} from "./image-validation.js";
import {
  ANALYSIS_QUEUE,
  type ArtworkAnalysisQueue,
} from "../analysis/analysis.queue.js";
import { PrivacyService } from "../privacy/privacy.service.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 12_000;
const MIN_IMAGE_DIMENSION = 256;
const UPLOAD_TTL_SECONDS = 10 * 60;

const fileExtensions: Record<ArtworkMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

@Injectable()
export class UploadService {
  constructor(
    @Inject(UPLOAD_REPOSITORY) private readonly repository: UploadRepository,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    @Inject(ANALYSIS_QUEUE)
    private readonly analysisQueue: ArtworkAnalysisQueue,
    @Inject(PrivacyService) private readonly privacyService: PrivacyService,
  ) {}

  async createUpload(
    userId: string,
    rawInput: Record<string, unknown>,
    now: Date = new Date(),
  ): Promise<CreateUploadResult> {
    await this.privacyService.assertArtworkStorageAllowed(userId);
    const input = this.validateCreateInput(rawInput);
    const extension = fileExtensions[input.mimeType];
    const objectKey = `users/${userId}/artworks/${randomUUID()}/original.${extension}`;
    const expiresAt = new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1_000);
    const record = await this.repository.createPendingUpload({
      ...input,
      expiresAt,
      objectKey,
      userId,
    });
    if (!record) {
      throw new BadRequestException({
        code: "UPLOAD_REQUEST_CONFLICT",
        message: "上传请求标识与已有记录冲突，请重新选择图片。",
      });
    }
    const remainingSeconds = Math.floor(
      (record.expiresAt.getTime() - now.getTime()) / 1_000,
    );
    if (remainingSeconds <= 0) {
      throw new BadRequestException({
        code: "UPLOAD_EXPIRED",
        message: "上传地址已过期，请重新选择图片。",
      });
    }
    const uploadUrl = await this.objectStorage.createUploadUrl({
      expiresInSeconds: Math.min(UPLOAD_TTL_SECONDS, remainingSeconds),
      mimeType: record.mimeType,
      objectKey: record.objectKey,
    });

    return {
      artworkId: record.artworkId,
      expiresAt: record.expiresAt.toISOString(),
      requiredHeaders: { "content-type": record.mimeType },
      uploadId: record.uploadId,
      uploadUrl,
    };
  }

  async cancelUpload(
    uploadId: string,
    userId: string,
  ): Promise<CancelUploadResult> {
    const upload = await this.repository.findOwnedUpload(uploadId, userId);
    if (!upload) {
      throw new NotFoundException({
        code: "UPLOAD_NOT_FOUND",
        message: "没有找到上传任务。",
      });
    }
    if (upload.status === "DELETED") {
      return { artworkId: upload.artworkId, status: "DELETED", uploadId };
    }
    if (!["PENDING_UPLOAD", "DELETION_PENDING"].includes(upload.status)) {
      throw new BadRequestException({
        code: "UPLOAD_NOT_CANCELLABLE",
        message: "上传已经完成处理，不能再取消；可在练习记录中删除作品。",
      });
    }
    const claimed = await this.repository.claimPendingUploadCancellation(
      uploadId,
      userId,
    );
    if (!claimed) {
      throw new BadRequestException({
        code: "UPLOAD_CANCEL_CONFLICT",
        message: "上传状态已经变化，请刷新后重试。",
      });
    }
    await this.objectStorage.deletePrivateObject(claimed.objectKey);
    if (
      !(await this.repository.finishPendingUploadCancellation(uploadId, userId))
    ) {
      throw new BadRequestException({ code: "UPLOAD_CANCEL_CONFLICT" });
    }
    return { artworkId: claimed.artworkId, status: "DELETED", uploadId };
  }

  async completeUpload(
    uploadId: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<CompleteUploadResult> {
    const upload = await this.repository.findOwnedUpload(uploadId, userId);
    if (!upload) {
      throw new NotFoundException({
        code: "UPLOAD_NOT_FOUND",
        message: "没有找到上传任务。",
      });
    }
    if (upload.status === "PENDING_UPLOAD" && upload.expiresAt <= now) {
      throw new BadRequestException({
        code: "UPLOAD_EXPIRED",
        message: "上传地址已过期，请重新选择图片。",
      });
    }

    if (upload.status === "PENDING_UPLOAD") {
      const storedObject = await this.objectStorage.headPrivateObject(
        upload.objectKey,
      );
      if (!storedObject) {
        throw new BadRequestException({
          code: "UPLOAD_OBJECT_NOT_FOUND",
          message: "图片尚未上传完成。",
        });
      }
      if (storedObject.contentLength !== upload.sizeBytes) {
        return this.rejectUploadedObject(uploadId, userId, {
          code: "UPLOAD_SIZE_MISMATCH",
          message: "上传图片大小与预期不一致，请重新上传。",
        });
      }
      if (storedObject.contentType !== upload.mimeType) {
        return this.rejectUploadedObject(uploadId, userId, {
          code: "UPLOAD_TYPE_MISMATCH",
          message: "上传图片格式与预期不一致，请重新上传。",
        });
      }
      const bytes = await this.objectStorage.readPrivateObject(
        upload.objectKey,
        upload.sizeBytes,
      );
      if (bytes.byteLength !== upload.sizeBytes) {
        return this.rejectUploadedObject(uploadId, userId, {
          code: "UPLOAD_SIZE_MISMATCH",
          message: "上传图片大小在校验期间发生变化，请重新上传。",
        });
      }
      try {
        await validateUploadedImage(bytes, upload);
      } catch (error: unknown) {
        if (error instanceof UploadedImageValidationError) {
          return this.rejectUploadedObject(uploadId, userId, {
            code: error.code,
            message: error.message,
          });
        }
        throw error;
      }
    }

    const completed = await this.repository.markUploaded(uploadId, userId, now);
    if (!completed) {
      throw new BadRequestException({
        code: "UPLOAD_NOT_PENDING",
        message: "上传任务已取消或状态已经变化。",
      });
    }
    await this.analysisQueue.enqueue({
      analysisId: completed.analysisId,
      artworkId: completed.artworkId,
      mimeType: completed.mimeType,
      objectKey: completed.objectKey,
    });
    return {
      analysisId: completed.analysisId,
      artworkId: completed.artworkId,
      status: "PROCESSING",
      uploadedAt: now.toISOString(),
    };
  }

  private validateCreateInput(
    rawInput: Record<string, unknown>,
  ): CreateUploadInput {
    const { clientRequestId, height, mimeType, sizeBytes, width } = rawInput;
    if (
      typeof clientRequestId !== "string" ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(clientRequestId)
    ) {
      throw new BadRequestException({
        code: "INVALID_UPLOAD_REQUEST_ID",
        message: "上传请求标识无效。",
      });
    }
    if (
      typeof mimeType !== "string" ||
      !allowedArtworkMimeTypes.includes(mimeType as ArtworkMimeType)
    ) {
      throw new BadRequestException({
        code: "UNSUPPORTED_IMAGE_TYPE",
        message: "仅支持 JPEG、PNG 或 WebP 图片。",
      });
    }
    if (
      !Number.isInteger(sizeBytes) ||
      Number(sizeBytes) <= 0 ||
      Number(sizeBytes) > MAX_UPLOAD_BYTES
    ) {
      throw new BadRequestException({
        code: "INVALID_IMAGE_SIZE",
        message: "图片大小必须在 10 MB 以内。",
      });
    }
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      Number(width) < MIN_IMAGE_DIMENSION ||
      Number(height) < MIN_IMAGE_DIMENSION ||
      Number(width) > MAX_IMAGE_DIMENSION ||
      Number(height) > MAX_IMAGE_DIMENSION ||
      Number(width) * Number(height) > MAX_ARTWORK_PIXELS
    ) {
      throw new BadRequestException({
        code: "INVALID_IMAGE_DIMENSIONS",
        message:
          "图片边长必须在 256 到 12000 像素之间，且总像素不超过 4000 万。",
      });
    }

    return {
      clientRequestId,
      height: Number(height),
      mimeType: mimeType as ArtworkMimeType,
      sizeBytes: Number(sizeBytes),
      width: Number(width),
    };
  }

  private async rejectUploadedObject(
    uploadId: string,
    userId: string,
    response: { code: string; message: string },
  ): Promise<never> {
    const claimed = await this.repository.claimPendingUploadCancellation(
      uploadId,
      userId,
    );
    if (claimed) {
      await this.objectStorage.deletePrivateObject(claimed.objectKey);
      await this.repository.finishPendingUploadCancellation(uploadId, userId);
    }
    throw new BadRequestException(response);
  }
}
