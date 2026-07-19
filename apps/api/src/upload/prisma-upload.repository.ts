import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type {
  PendingUploadRecord,
  UploadRepository,
} from "./upload.repository.js";
import type { ArtworkMimeType } from "./upload.types.js";

@Injectable()
export class PrismaUploadRepository implements UploadRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  claimPendingUploadCancellation(uploadId: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.uploadSession.findFirst({
        where: {
          id: uploadId,
          artwork: {
            status: { in: ["PENDING_UPLOAD", "DELETION_PENDING"] },
            userId,
          },
        },
        select: {
          artwork: { select: { id: true, status: true } },
          objectKey: true,
        },
      });
      if (!session) return null;
      if (session.artwork.status === "PENDING_UPLOAD") {
        const claimed = await transaction.userArtwork.updateMany({
          data: { status: "DELETION_PENDING" },
          where: {
            id: session.artwork.id,
            status: "PENDING_UPLOAD",
            userId,
          },
        });
        if (claimed.count !== 1) return null;
      }
      return { artworkId: session.artwork.id, objectKey: session.objectKey };
    });
  }

  async finishPendingUploadCancellation(uploadId: string, userId: string) {
    const updated = await this.prisma.userArtwork.updateMany({
      data: { status: "DELETED" },
      where: {
        status: "DELETION_PENDING",
        uploadSession: { id: uploadId },
        userId,
      },
    });
    return updated.count === 1;
  }

  async createPendingUpload(input: {
    clientRequestId: string;
    expiresAt: Date;
    height: number;
    mimeType: ArtworkMimeType;
    objectKey: string;
    sizeBytes: number;
    userId: string;
    width: number;
  }) {
    const findExisting = () =>
      this.prisma.uploadSession.findUnique({
        where: { clientRequestId: input.clientRequestId },
        select: {
          artwork: {
            select: {
              height: true,
              id: true,
              mimeType: true,
              sizeBytes: true,
              status: true,
              userId: true,
              width: true,
            },
          },
          expiresAt: true,
          id: true,
          objectKey: true,
        },
      });
    const reuse = async () => {
      const existing = await findExisting();
      if (!existing) return undefined;
      if (
        existing.artwork.userId !== input.userId ||
        existing.artwork.status !== "PENDING_UPLOAD" ||
        existing.artwork.height !== input.height ||
        existing.artwork.width !== input.width ||
        existing.artwork.sizeBytes !== input.sizeBytes ||
        existing.artwork.mimeType !== input.mimeType
      ) {
        return null;
      }
      return {
        artworkId: existing.artwork.id,
        expiresAt: existing.expiresAt,
        mimeType: existing.artwork.mimeType as ArtworkMimeType,
        objectKey: existing.objectKey,
        uploadId: existing.id,
      };
    };
    const existing = await reuse();
    if (existing !== undefined) return existing;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const artwork = await transaction.userArtwork.create({
          data: {
            height: input.height,
            mimeType: input.mimeType,
            originalObjectKey: input.objectKey,
            sizeBytes: input.sizeBytes,
            userId: input.userId,
            width: input.width,
          },
          select: { id: true },
        });
        const uploadSession = await transaction.uploadSession.create({
          data: {
            artworkId: artwork.id,
            clientRequestId: input.clientRequestId,
            expiresAt: input.expiresAt,
            objectKey: input.objectKey,
          },
          select: { id: true },
        });

        return {
          artworkId: artwork.id,
          expiresAt: input.expiresAt,
          mimeType: input.mimeType,
          objectKey: input.objectKey,
          uploadId: uploadSession.id,
        };
      });
    } catch (error: unknown) {
      const raced = await reuse();
      if (raced !== undefined) return raced;
      throw error;
    }
  }

  async findOwnedUpload(
    uploadId: string,
    userId: string,
  ): Promise<PendingUploadRecord | null> {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id: uploadId, artwork: { userId } },
      select: {
        artwork: {
          select: {
            height: true,
            id: true,
            mimeType: true,
            sizeBytes: true,
            status: true,
            width: true,
          },
        },
        expiresAt: true,
        id: true,
        objectKey: true,
      },
    });

    if (!session) {
      return null;
    }

    return {
      artworkId: session.artwork.id,
      expiresAt: session.expiresAt,
      height: session.artwork.height,
      mimeType: session.artwork.mimeType as ArtworkMimeType,
      objectKey: session.objectKey,
      sizeBytes: session.artwork.sizeBytes,
      status: session.artwork.status as PendingUploadRecord["status"],
      uploadId: session.id,
      width: session.artwork.width,
    };
  }

  async markUploaded(uploadId: string, userId: string, uploadedAt: Date) {
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.uploadSession.findFirst({
        where: { id: uploadId, artwork: { userId } },
        select: {
          artwork: { select: { status: true } },
          artworkId: true,
          completedAt: true,
        },
      });
      if (!session) return null;
      if (session.artwork.status === "PENDING_UPLOAD") {
        const claimed = await transaction.userArtwork.updateMany({
          data: { status: "PROCESSING", uploadedAt },
          where: {
            id: session.artworkId,
            status: "PENDING_UPLOAD",
            userId,
          },
        });
        if (claimed.count !== 1) return null;

        await transaction.uploadSession.update({
          data: { completedAt: uploadedAt },
          where: { id: uploadId },
        });
      } else if (
        !session.completedAt ||
        !["PROCESSING", "READY", "FAILED"].includes(session.artwork.status)
      ) {
        return null;
      }
      const analysis = await transaction.artworkAnalysis.upsert({
        create: { artworkId: session.artworkId },
        update: {},
        where: { artworkId: session.artworkId },
        select: { id: true },
      });

      const artwork = await transaction.userArtwork.findUniqueOrThrow({
        where: { id: session.artworkId },
        select: { mimeType: true, originalObjectKey: true },
      });

      return {
        analysisId: analysis.id,
        artworkId: session.artworkId,
        mimeType: artwork.mimeType as ArtworkMimeType,
        objectKey: artwork.originalObjectKey,
      };
    });
  }
}
