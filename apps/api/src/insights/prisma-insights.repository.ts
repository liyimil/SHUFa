import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import type { InsightsRepository } from "./insights.repository.js";
import type {
  AdviceReviewVerdict,
  AdviceSampleRecord,
  ProductEventName,
} from "./insights.types.js";

const adviceSampleSelect = {
  adviceReview: {
    select: {
      comment: true,
      reviewerKey: true,
      updatedAt: true,
      verdict: true,
    },
  },
  adviceSnapshot: true,
  artwork: { select: { originalObjectKey: true } },
  createdAt: true,
  id: true,
  sequence: true,
  session: {
    select: {
      character: { select: { value: true } },
      id: true,
      selectedGlyph: {
        select: {
          assets: {
            orderBy: { kind: "asc" },
            select: { objectKey: true },
            where: { kind: { in: ["GLYPH_CROP", "THUMBNAIL"] } },
          },
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
    },
  },
} satisfies Prisma.PracticeAttemptSelect;

type AdviceSampleRow = Prisma.PracticeAttemptGetPayload<{
  select: typeof adviceSampleSelect;
}>;

function mapAdviceSample(row: AdviceSampleRow): AdviceSampleRecord {
  const work = row.session.selectedGlyph.sourceAsset.edition.work;
  return {
    advice: row.adviceSnapshot as Record<string, unknown>,
    attemptCreatedAt: row.createdAt,
    attemptId: row.id,
    character: row.session.character.value,
    master: {
      calligrapherName: work.calligrapher.name,
      imageObjectKey: row.session.selectedGlyph.assets[0]?.objectKey ?? null,
      workTitle: work.title,
    },
    practiceSessionId: row.session.id,
    review: row.adviceReview
      ? {
          comment: row.adviceReview.comment,
          reviewedAt: row.adviceReview.updatedAt,
          reviewerKey: row.adviceReview.reviewerKey,
          verdict: row.adviceReview.verdict as AdviceReviewVerdict,
        }
      : null,
    sequence: row.sequence,
    userImageObjectKey: row.artwork.originalObjectKey,
  };
}

@Injectable()
export class PrismaInsightsRepository implements InsightsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async isOwnedPracticeSession(userId: string, sessionId: string) {
    return Boolean(
      await this.prisma.practiceSession.findFirst({
        select: { id: true },
        where: { id: sessionId, userId },
      }),
    );
  }

  async listAdviceSamples(
    filters: Parameters<InsightsRepository["listAdviceSamples"]>[0],
  ) {
    const rows = await this.prisma.practiceAttempt.findMany({
      orderBy: { createdAt: "desc" },
      select: adviceSampleSelect,
      take: filters.limit,
      where: {
        adviceReview:
          filters.status === "REVIEWED"
            ? { isNot: null }
            : filters.status === "UNREVIEWED"
              ? null
              : undefined,
        adviceSnapshot: { not: Prisma.DbNull },
        artwork: { status: { not: "DELETED" } },
      },
    });
    return rows.map(mapAdviceSample);
  }

  async readFunnel(from: Date, to: Date) {
    const rows = await this.prisma.productEvent.groupBy({
      _count: { _all: true },
      by: ["name"],
      where: { occurredAt: { gte: from, lt: to } },
    });
    return rows.map((row) => ({
      count: row._count._all,
      name: row.name as ProductEventName,
    }));
  }

  async recordEvent(input: Parameters<InsightsRepository["recordEvent"]>[0]) {
    const created = await this.prisma.productEvent.createMany({
      data: {
        id: input.eventId,
        name: input.name,
        occurredAt: input.occurredAt,
        practiceSessionId: input.practiceSessionId,
        userId: input.userId,
      },
      skipDuplicates: true,
    });
    if (created.count === 1) return "CREATED" as const;
    const existing = await this.prisma.productEvent.findFirst({
      select: {
        name: true,
        occurredAt: true,
        practiceSessionId: true,
        userId: true,
      },
      where: {
        OR: [
          { id: input.eventId },
          ...(input.practiceSessionId
            ? [
                {
                  name: input.name,
                  practiceSessionId: input.practiceSessionId,
                  userId: input.userId,
                },
              ]
            : []),
        ],
      },
    });
    if (
      existing?.userId === input.userId &&
      existing.name === input.name &&
      existing.practiceSessionId === input.practiceSessionId &&
      input.practiceSessionId !== null
    ) {
      return "DUPLICATE";
    }
    return existing &&
      existing.userId === input.userId &&
      existing.name === input.name &&
      existing.practiceSessionId === input.practiceSessionId &&
      existing.occurredAt.getTime() === input.occurredAt.getTime()
      ? "DUPLICATE"
      : "CONFLICT";
  }

  saveAdviceReview(
    input: Parameters<InsightsRepository["saveAdviceReview"]>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.practiceAttempt.findFirst({
        select: adviceSampleSelect,
        where: {
          adviceSnapshot: { not: Prisma.DbNull },
          artwork: { status: { not: "DELETED" } },
          id: input.attemptId,
        },
      });
      if (!attempt) return null;
      const before = attempt.adviceReview;
      await transaction.adviceReview.upsert({
        create: {
          attemptId: input.attemptId,
          comment: input.comment,
          reviewerKey: input.actorKey,
          verdict: input.verdict,
        },
        update: {
          comment: input.comment,
          reviewerKey: input.actorKey,
          updatedAt: input.now,
          verdict: input.verdict,
        },
        where: { attemptId: input.attemptId },
      });
      await transaction.contentAudit.create({
        data: {
          action: "REVIEW_ADVICE",
          actorKey: input.actorKey,
          entityId: input.attemptId,
          entityType: "PracticeAttempt",
          snapshot: {
            after: { comment: input.comment, verdict: input.verdict },
            before: before
              ? { comment: before.comment, verdict: before.verdict }
              : null,
          },
        },
      });
      const reviewed = await transaction.practiceAttempt.findUniqueOrThrow({
        select: adviceSampleSelect,
        where: { id: input.attemptId },
      });
      return mapAdviceSample(reviewed);
    });
  }
}
