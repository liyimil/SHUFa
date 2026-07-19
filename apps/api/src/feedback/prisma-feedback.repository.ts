import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type { FeedbackRepository } from "./feedback.repository.js";
import type { FeedbackKind } from "./feedback.types.js";

const userTicketSelect = {
  accurate: true,
  createdAt: true,
  id: true,
  kind: true,
  message: true,
  referenceId: true,
  referenceType: true,
  resolutionNote: true,
  resolvedAt: true,
  status: true,
  updatedAt: true,
} as const;

const adminTicketSelect = {
  ...userTicketSelect,
  assignedTo: true,
} as const;

@Injectable()
export class PrismaFeedbackRepository implements FeedbackRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(input: Parameters<FeedbackRepository["create"]>[0]) {
    return this.prisma.userFeedback.create({
      data: input,
      select: { id: true, status: true },
    });
  }

  async isValidReference(
    userId: string,
    kind: FeedbackKind,
    referenceId: string,
  ): Promise<boolean> {
    if (kind === "CONTENT_ERROR") {
      return Boolean(
        await this.prisma.glyph.findFirst({
          where: { contentStatus: "PUBLISHED", id: referenceId },
          select: { id: true },
        }),
      );
    }
    if (["QUALITY_RESULT", "RECOGNITION_ERROR"].includes(kind)) {
      return Boolean(
        await this.prisma.userArtwork.findFirst({
          where: { id: referenceId, status: { not: "DELETED" }, userId },
          select: { id: true },
        }),
      );
    }
    if (kind === "STRUCTURE_ADVICE") {
      return Boolean(
        await this.prisma.practiceSession.findFirst({
          where: { id: referenceId, userId },
          select: { id: true },
        }),
      );
    }
    return true;
  }

  listByUser(userId: string) {
    return this.prisma.userFeedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      where: { userId },
      select: userTicketSelect,
    });
  }

  listForAdmin(filters: Parameters<FeedbackRepository["listForAdmin"]>[0]) {
    return this.prisma.userFeedback.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      where: { kind: filters.kind, status: filters.status },
      select: adminTicketSelect,
    });
  }

  updateByAdmin(
    actorKey: string,
    feedbackId: string,
    update: Parameters<FeedbackRepository["updateByAdmin"]>[2],
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.userFeedback.findUnique({
        where: { id: feedbackId },
        select: adminTicketSelect,
      });
      if (!current) return null;
      const nextStatus = update.status ?? current.status;
      const updated = await transaction.userFeedback.update({
        data: {
          ...update,
          resolvedAt: ["RESOLVED", "DISMISSED"].includes(nextStatus)
            ? nextStatus === current.status
              ? (current.resolvedAt ?? now)
              : now
            : null,
        },
        where: { id: feedbackId },
        select: adminTicketSelect,
      });
      await transaction.contentAudit.create({
        data: {
          action: "UPDATE_FEEDBACK",
          actorKey,
          entityId: feedbackId,
          entityType: "UserFeedback",
          snapshot: {
            after: {
              assignedTo: updated.assignedTo,
              resolutionNote: updated.resolutionNote,
              status: updated.status,
            },
            before: {
              assignedTo: current.assignedTo,
              resolutionNote: current.resolutionNote,
              status: current.status,
            },
          },
        },
      });
      return updated;
    });
  }
}
