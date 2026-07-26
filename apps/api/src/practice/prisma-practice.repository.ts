import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  catalogGlyphSelect,
  mapPublishedGlyph,
  publishedGlyphWhere,
} from "../catalog/prisma-catalog.repository.js";
import type { PracticeRepository } from "./practice.repository.js";
import type { PracticeRecord } from "./practice.types.js";

const practiceSelect = {
  attempts: {
    orderBy: { sequence: "asc" },
    select: {
      adviceSnapshot: true,
      analysisRun: { select: { failureCode: true, status: true } },
      artwork: {
        select: { id: true, mimeType: true, originalObjectKey: true },
      },
      createdAt: true,
      id: true,
      sequence: true,
    },
    where: {
      artwork: { status: { notIn: ["DELETION_PENDING", "DELETED"] } },
    },
  },
  character: { select: { value: true } },
  createdAt: true,
  id: true,
  selectedGlyph: {
    select: {
      assets: {
        orderBy: { kind: "asc" },
        select: { objectKey: true },
        where: { kind: { in: ["GLYPH_CROP", "THUMBNAIL"] } },
      },
      id: true,
      sourceAsset: {
        select: {
          edition: {
            select: {
              work: {
                select: {
                  calligrapher: { select: { name: true } },
                  title: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PracticeSessionSelect;

type PracticeRow = Prisma.PracticeSessionGetPayload<{
  select: typeof practiceSelect;
}>;

function mapPractice(row: PracticeRow): PracticeRecord {
  return {
    attempts: row.attempts.map((attempt) => ({
      attemptId: attempt.id,
      artworkId: attempt.artwork.id,
      advice: attempt.adviceSnapshot,
      analysis: attempt.analysisRun,
      createdAt: attempt.createdAt,
      objectKey: attempt.artwork.originalObjectKey,
      mimeType: attempt.artwork.mimeType,
      sequence: attempt.sequence,
    })),
    character: row.character.value,
    createdAt: row.createdAt,
    id: row.id,
    master: {
      calligrapherName:
        row.selectedGlyph.sourceAsset.edition.work.calligrapher.name,
      glyphId: row.selectedGlyph.id,
      imageObjectKey: row.selectedGlyph.assets[0]?.objectKey ?? null,
      workTitle: row.selectedGlyph.sourceAsset.edition.work.title,
    },
  };
}

@Injectable()
export class PrismaPracticeRepository implements PracticeRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createPractice(userId: string, artworkId: string, glyphId: string) {
    const now = new Date();
    const artwork = await this.prisma.userArtwork.findFirst({
      where: {
        confirmedCharacterId: { not: null },
        id: artworkId,
        analysis: { status: "PASSED" },
        practiceAttempt: null,
        status: "READY",
        userId,
      },
      select: { confirmedCharacterId: true },
    });
    const glyph = artwork
      ? await this.prisma.glyph.findFirst({
          where: {
            characterId: artwork.confirmedCharacterId ?? undefined,
            contentStatus: "PUBLISHED",
            id: glyphId,
            sourceAsset: {
              rightsRecord: {
                OR: [{ validUntil: null }, { validUntil: { gt: now } }],
                status: "CLEARED_PUBLIC",
              },
            },
          },
          select: { id: true },
        })
      : null;
    if (!artwork?.confirmedCharacterId || !glyph) return null;

    const created = await this.prisma.practiceSession.create({
      data: {
        attempts: { create: { artworkId, sequence: 1 } },
        characterId: artwork.confirmedCharacterId,
        selectedGlyphId: glyph.id,
        userId,
      },
      select: practiceSelect,
    });
    return mapPractice(created);
  }

  async addAttempt(userId: string, sessionId: string, artworkId: string) {
    const session = await this.prisma.practiceSession.findFirst({
      where: { id: sessionId, userId },
      select: { characterId: true, _count: { select: { attempts: true } } },
    });
    if (!session) return null;
    const artwork = await this.prisma.userArtwork.findFirst({
      where: {
        confirmedCharacterId: session.characterId,
        id: artworkId,
        analysis: { status: "PASSED" },
        practiceAttempt: null,
        status: "READY",
        userId,
      },
      select: { id: true },
    });
    if (!artwork) return null;
    const updated = await this.prisma.practiceSession.update({
      data: {
        attempts: {
          create: { artworkId, sequence: session._count.attempts + 1 },
        },
      },
      where: { id: sessionId },
      select: practiceSelect,
    });
    return mapPractice(updated);
  }

  async listPractices(userId: string) {
    const rows = await this.prisma.practiceSession.findMany({
      orderBy: { createdAt: "desc" },
      select: practiceSelect,
      where: { userId },
    });
    return rows.map(mapPractice);
  }

  async findOwnedPractice(userId: string, sessionId: string) {
    const row = await this.prisma.practiceSession.findFirst({
      select: practiceSelect,
      where: { id: sessionId, userId },
    });
    return row ? mapPractice(row) : null;
  }

  async createFavorite(
    userId: string,
    glyphId: string,
    groupId: string | null | undefined,
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const glyph = await transaction.glyph.findFirst({
        where: { ...publishedGlyphWhere(now), id: glyphId },
        select: { id: true },
      });
      if (!glyph) return false;
      if (
        groupId !== undefined &&
        groupId !== null &&
        !(await transaction.favoriteGroup.findFirst({
          select: { id: true },
          where: { id: groupId, userId },
        }))
      ) {
        return false;
      }
      const existing = await transaction.favoriteGlyph.findUnique({
        select: { groupId: true },
        where: { userId_glyphId: { glyphId, userId } },
      });
      if (existing && groupId === undefined) return true;
      const targetGroupId = groupId === undefined ? null : groupId;
      if (existing?.groupId === targetGroupId) return true;
      const maximum = await transaction.favoriteGlyph.aggregate({
        _max: { sortOrder: true },
        where: { groupId: targetGroupId, userId },
      });
      const sortOrder = (maximum._max.sortOrder ?? -1) + 1;
      await transaction.favoriteGlyph.upsert({
        create: { glyphId, groupId: targetGroupId, sortOrder, userId },
        update: { groupId: targetGroupId, sortOrder },
        where: { userId_glyphId: { glyphId, userId } },
      });
      return true;
    });
  }

  async removeFavorite(userId: string, glyphId: string) {
    await this.prisma.favoriteGlyph.deleteMany({ where: { glyphId, userId } });
  }

  async listFavorites(userId: string, now: Date) {
    const [groups, favorites] = await this.prisma.$transaction([
      this.prisma.favoriteGroup.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, sortOrder: true },
        where: { userId },
      }),
      this.prisma.favoriteGlyph.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          glyph: { select: catalogGlyphSelect },
          groupId: true,
          id: true,
          sortOrder: true,
        },
        where: { glyph: publishedGlyphWhere(now), userId },
      }),
    ]);
    const items = favorites.map((favorite) => ({
      character: favorite.glyph.character.value,
      favoriteId: favorite.id,
      glyph: mapPublishedGlyph(favorite.glyph),
      groupId: favorite.groupId,
      sortOrder: favorite.sortOrder,
    }));
    return {
      groups: groups.map((group) => ({
        ...group,
        items: items.filter((item) => item.groupId === group.id),
      })),
      ungrouped: items.filter((item) => item.groupId === null),
    };
  }

  async createFavoriteGroup(userId: string, name: string) {
    return this.prisma.$transaction(async (transaction) => {
      if (
        await transaction.favoriteGroup.findFirst({
          select: { id: true },
          where: { name, userId },
        })
      ) {
        return null;
      }
      const maximum = await transaction.favoriteGroup.aggregate({
        _max: { sortOrder: true },
        where: { userId },
      });
      return transaction.favoriteGroup.create({
        data: {
          name,
          sortOrder: (maximum._max.sortOrder ?? -1) + 1,
          userId,
        },
        select: { id: true, name: true, sortOrder: true },
      });
    });
  }

  async updateFavoriteGroup(userId: string, groupId: string, name: string) {
    const duplicate = await this.prisma.favoriteGroup.findFirst({
      select: { id: true },
      where: { id: { not: groupId }, name, userId },
    });
    if (duplicate) return false;
    const updated = await this.prisma.favoriteGroup.updateMany({
      data: { name },
      where: { id: groupId, userId },
    });
    return updated.count === 1;
  }

  async removeFavoriteGroup(userId: string, groupId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const group = await transaction.favoriteGroup.findFirst({
        select: { id: true },
        where: { id: groupId, userId },
      });
      if (!group) return false;
      const maximum = await transaction.favoriteGlyph.aggregate({
        _max: { sortOrder: true },
        where: { groupId: null, userId },
      });
      const moved = await transaction.favoriteGlyph.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
        where: { groupId, userId },
      });
      await Promise.all(
        moved.map((favorite, index) =>
          transaction.favoriteGlyph.update({
            data: {
              groupId: null,
              sortOrder: (maximum._max.sortOrder ?? -1) + index + 1,
            },
            where: { id: favorite.id },
          }),
        ),
      );
      await transaction.favoriteGroup.delete({ where: { id: groupId } });
      return true;
    });
  }

  async reorderFavorite(
    userId: string,
    glyphId: string,
    direction: "UP" | "DOWN",
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.favoriteGlyph.findUnique({
        select: { groupId: true, id: true },
        where: { userId_glyphId: { glyphId, userId } },
      });
      if (!current) return false;
      const siblings = await transaction.favoriteGlyph.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
        where: { groupId: current.groupId, userId },
      });
      const index = siblings.findIndex((item) => item.id === current.id);
      const target = direction === "UP" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= siblings.length) return true;
      [siblings[index], siblings[target]] = [
        siblings[target]!,
        siblings[index]!,
      ];
      await Promise.all(
        siblings.map((item, sortOrder) =>
          transaction.favoriteGlyph.update({
            data: { sortOrder },
            where: { id: item.id },
          }),
        ),
      );
      return true;
    });
  }

  async reorderFavoriteGroup(
    userId: string,
    groupId: string,
    direction: "UP" | "DOWN",
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const groups = await transaction.favoriteGroup.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
        where: { userId },
      });
      const index = groups.findIndex((item) => item.id === groupId);
      if (index < 0) return false;
      const target = direction === "UP" ? index - 1 : index + 1;
      if (target < 0 || target >= groups.length) return true;
      [groups[index], groups[target]] = [groups[target]!, groups[index]!];
      await Promise.all(
        groups.map((group, sortOrder) =>
          transaction.favoriteGroup.update({
            data: { sortOrder },
            where: { id: group.id },
          }),
        ),
      );
      return true;
    });
  }

  async createShare(
    userId: string,
    sessionId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    const session = await this.prisma.practiceSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!session) return null;
    return this.prisma.shareLink.create({
      data: { expiresAt, sessionId, tokenHash, userId },
      select: { id: true },
    });
  }

  async findPublicShare(tokenHash: string, now: Date) {
    const share = await this.prisma.shareLink.findFirst({
      where: { expiresAt: { gt: now }, revokedAt: null, tokenHash },
      select: { session: { select: practiceSelect } },
    });
    return share ? mapPractice(share.session) : null;
  }

  async revokeShare(userId: string, shareId: string, now: Date) {
    const result = await this.prisma.shareLink.updateMany({
      data: { revokedAt: now },
      where: { id: shareId, revokedAt: null, userId },
    });
    return result.count > 0;
  }

  async requestArtworkDeletion(userId: string, artworkId: string, now: Date) {
    return this.prisma.$transaction(async (transaction) => {
      const artwork = await transaction.userArtwork.findFirst({
        select: {
          deletionTask: {
            select: {
              attemptNumber: true,
              id: true,
              objectKey: true,
              status: true,
              updatedAt: true,
            },
          },
          originalObjectKey: true,
          status: true,
        },
        where: { id: artworkId, userId },
      });
      if (!artwork) return null;
      const existing = artwork.deletionTask;
      if (existing?.status === "COMPLETED") {
        return {
          artworkId,
          attemptNumber: existing.attemptNumber,
          deletionId: existing.id,
          objectKey: existing.objectKey,
          status: "COMPLETED" as const,
          updatedAt: existing.updatedAt,
        };
      }
      if (existing?.status === "PENDING") {
        return {
          artworkId,
          attemptNumber: existing.attemptNumber,
          deletionId: existing.id,
          objectKey: existing.objectKey,
          status: "PENDING" as const,
          updatedAt: existing.updatedAt,
        };
      }
      if (existing?.status === "FAILED") {
        const retried = await transaction.artworkDeletionTask.updateMany({
          data: {
            attemptNumber: { increment: 1 },
            completedAt: null,
            failureCode: null,
            failureMessage: null,
            requestedAt: now,
            status: "PENDING",
            updatedAt: now,
          },
          where: { id: existing.id, status: "FAILED" },
        });
        if (retried.count === 1) {
          return {
            artworkId,
            attemptNumber: existing.attemptNumber + 1,
            deletionId: existing.id,
            objectKey: existing.objectKey,
            status: "PENDING" as const,
            updatedAt: now,
          };
        }
        const current = await transaction.artworkDeletionTask.findUnique({
          select: {
            attemptNumber: true,
            id: true,
            objectKey: true,
            status: true,
            updatedAt: true,
          },
          where: { id: existing.id },
        });
        return current
          ? {
              artworkId,
              attemptNumber: current.attemptNumber,
              deletionId: current.id,
              objectKey: current.objectKey,
              status:
                current.status === "COMPLETED"
                  ? ("COMPLETED" as const)
                  : ("PENDING" as const),
              updatedAt: current.updatedAt,
            }
          : null;
      }
      if (
        !["UPLOADED", "PROCESSING", "READY", "FAILED"].includes(artwork.status)
      ) {
        return null;
      }

      await transaction.artworkAnalysis.deleteMany({ where: { artworkId } });
      await transaction.practiceAnalysisRun.deleteMany({
        where: { attempt: { artworkId } },
      });
      await transaction.adviceReview.deleteMany({
        where: { attempt: { artworkId } },
      });
      await transaction.practiceAttempt.updateMany({
        data: { adviceSnapshot: Prisma.DbNull },
        where: { artworkId },
      });
      await transaction.shareLink.updateMany({
        data: { revokedAt: now },
        where: {
          revokedAt: null,
          session: { attempts: { some: { artworkId } } },
        },
      });
      await transaction.userArtwork.update({
        data: {
          failureCode: "USER_DELETION_PENDING",
          status: "DELETION_PENDING",
          updatedAt: now,
        },
        where: { id: artworkId },
      });
      const task = await transaction.artworkDeletionTask.create({
        data: {
          artworkId,
          objectKey: artwork.originalObjectKey,
          requestedAt: now,
          updatedAt: now,
        },
        select: {
          attemptNumber: true,
          id: true,
          objectKey: true,
          updatedAt: true,
        },
      });
      return {
        artworkId,
        attemptNumber: task.attemptNumber,
        deletionId: task.id,
        objectKey: task.objectKey,
        status: "PENDING" as const,
        updatedAt: task.updatedAt,
      };
    });
  }

  async findOwnedArtworkDeletion(userId: string, deletionId: string) {
    const task = await this.prisma.artworkDeletionTask.findFirst({
      select: {
        artworkId: true,
        id: true,
        status: true,
        updatedAt: true,
      },
      where: { artwork: { userId }, id: deletionId },
    });
    if (!task) return null;
    return {
      artworkId: task.artworkId,
      deletionId: task.id,
      status:
        task.status === "COMPLETED"
          ? ("DELETED" as const)
          : task.status === "FAILED"
            ? ("FAILED" as const)
            : ("DELETION_PENDING" as const),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  async completeArtworkDeletion(input: {
    attemptNumber: number;
    deletionId: string;
    now: Date;
    objectKey: string;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const completed = await transaction.artworkDeletionTask.updateMany({
        data: {
          completedAt: input.now,
          failureCode: null,
          failureMessage: null,
          status: "COMPLETED",
          updatedAt: input.now,
        },
        where: {
          attemptNumber: input.attemptNumber,
          id: input.deletionId,
          objectKey: input.objectKey,
          status: "PENDING",
        },
      });
      const task = await transaction.artworkDeletionTask.findUnique({
        select: {
          artwork: { select: { status: true } },
          artworkId: true,
          attemptNumber: true,
          objectKey: true,
          status: true,
        },
        where: { id: input.deletionId },
      });
      if (
        !task ||
        task.attemptNumber !== input.attemptNumber ||
        task.objectKey !== input.objectKey
      ) {
        return false;
      }
      if (completed.count === 0) return task.status === "COMPLETED";
      if (task.artwork.status === "DELETED") return true;
      if (task.artwork.status !== "DELETION_PENDING") {
        throw new Error("Artwork deletion completed from an invalid state.");
      }
      const artwork = await transaction.userArtwork.updateMany({
        data: {
          failureCode: "USER_DELETED",
          status: "DELETED",
          updatedAt: input.now,
        },
        where: { id: task.artworkId, status: "DELETION_PENDING" },
      });
      if (artwork.count !== 1) {
        throw new Error("Artwork deletion state changed during completion.");
      }
      return true;
    });
  }

  async failArtworkDeletion(input: {
    attemptNumber: number;
    deletionId: string;
    failureCode: string;
    failureMessage: string;
    now: Date;
    objectKey: string;
  }) {
    const failed = await this.prisma.artworkDeletionTask.updateMany({
      data: {
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
        status: "FAILED",
        updatedAt: input.now,
      },
      where: {
        attemptNumber: input.attemptNumber,
        id: input.deletionId,
        objectKey: input.objectKey,
        status: { in: ["PENDING", "FAILED"] },
      },
    });
    return failed.count === 1;
  }

  async prepareAnalysisRun(input: {
    attemptId: string;
    masterObjectKey: string;
    userObjectKey: string;
  }) {
    const created = await this.prisma.practiceAnalysisRun.createMany({
      data: {
        attemptId: input.attemptId,
        masterObjectKey: input.masterObjectKey,
        updatedAt: new Date(),
        userObjectKey: input.userObjectKey,
      },
      skipDuplicates: true,
    });
    if (created.count === 1) return;
    const existing = await this.prisma.practiceAnalysisRun.findUnique({
      select: { masterObjectKey: true, status: true, userObjectKey: true },
      where: { attemptId: input.attemptId },
    });
    if (
      !existing ||
      existing.masterObjectKey !== input.masterObjectKey ||
      existing.userObjectKey !== input.userObjectKey
    ) {
      throw new Error("Practice analysis input assets changed unexpectedly.");
    }
  }

  async recordAnalysisFailure(input: {
    attemptId: string;
    failureCode: string;
    failureMessage: string;
    masterObjectKey: string;
    userObjectKey: string;
  }) {
    const result = await this.prisma.practiceAnalysisRun.updateMany({
      data: {
        completedAt: new Date(),
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
        status: "FAILED",
      },
      where: {
        attemptId: input.attemptId,
        masterObjectKey: input.masterObjectKey,
        status: { in: ["PENDING", "FAILED"] },
        userObjectKey: input.userObjectKey,
      },
    });
    return result.count === 1;
  }

  async recordAdvice(
    attemptId: string,
    advice: Record<string, unknown>,
    provenance: Parameters<PracticeRepository["recordAdvice"]>[2],
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const run = await transaction.practiceAnalysisRun.findUnique({
        select: {
          masterChecksumSha256: true,
          masterObjectKey: true,
          measurementVersion: true,
          modelVersion: true,
          normalizationVersion: true,
          ruleVersion: true,
          status: true,
          userChecksumSha256: true,
          userObjectKey: true,
        },
        where: { attemptId },
      });
      if (
        !run ||
        run.masterObjectKey !== provenance.masterObjectKey ||
        run.userObjectKey !== provenance.userObjectKey
      ) {
        return false;
      }
      if (run.status === "READY") {
        return (
          run.masterChecksumSha256 === provenance.masterChecksumSha256 &&
          run.userChecksumSha256 === provenance.userChecksumSha256 &&
          run.normalizationVersion === provenance.normalizationVersion &&
          run.measurementVersion === provenance.measurementVersion &&
          run.ruleVersion === provenance.ruleVersion &&
          run.modelVersion === provenance.modelVersion
        );
      }
      if (run.status !== "PENDING") return false;
      const attempt = await transaction.practiceAttempt.updateMany({
        data: { adviceSnapshot: advice as Prisma.InputJsonValue },
        where: { id: attemptId },
      });
      if (attempt.count !== 1) return false;
      await transaction.practiceAnalysisRun.update({
        data: {
          completedAt: now,
          failureCode: null,
          failureMessage: null,
          masterChecksumSha256: provenance.masterChecksumSha256,
          measurementVersion: provenance.measurementVersion,
          modelVersion: provenance.modelVersion,
          normalizationVersion: provenance.normalizationVersion,
          resultSnapshot: advice as Prisma.InputJsonValue,
          ruleVersion: provenance.ruleVersion,
          status: "READY",
          userChecksumSha256: provenance.userChecksumSha256,
        },
        where: { attemptId },
      });
      return true;
    });
  }

  async switchPracticeGlyph(
    userId: string,
    sessionId: string,
    glyphId: string,
  ) {
    const now = new Date();
    const session = await this.prisma.practiceSession.findFirst({
      select: { characterId: true },
      where: { id: sessionId, userId },
    });
    if (!session) return null;

    const glyph = await this.prisma.glyph.findFirst({
      where: {
        characterId: session.characterId,
        contentStatus: "PUBLISHED",
        id: glyphId,
        sourceAsset: {
          rightsRecord: {
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
            status: "CLEARED_PUBLIC",
          },
        },
      },
      select: { id: true },
    });
    if (!glyph) return null;

    await this.prisma.$transaction([
      this.prisma.practiceAnalysisRun.deleteMany({
        where: { attempt: { sessionId } },
      }),
      this.prisma.practiceAttempt.updateMany({
        data: { adviceSnapshot: Prisma.DbNull },
        where: { sessionId },
      }),
      this.prisma.practiceSession.update({
        data: { selectedGlyphId: glyph.id },
        where: { id: sessionId },
      }),
    ]);

    const updated = await this.prisma.practiceSession.findUnique({
      select: practiceSelect,
      where: { id: sessionId },
    });
    return updated ? mapPractice(updated) : null;
  }
}
