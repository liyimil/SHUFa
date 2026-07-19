import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaInsightsRepository } from "../src/insights/prisma-insights.repository.js";

const adviceRow = {
  adviceReview: null,
  adviceSnapshot: {
    suggestions: [
      { action: "略向左收", evidence: "重心偏右", phenomenon: "重心" },
    ],
  },
  artwork: { originalObjectKey: "users/test/artwork.jpg" },
  createdAt: new Date("2026-07-18T12:00:00.000Z"),
  id: "attempt-id",
  sequence: 1,
  session: {
    character: { value: "永" },
    id: "session-id",
    selectedGlyph: {
      assets: [{ objectKey: "content/glyphs/master.webp" }],
      sourceAsset: {
        edition: {
          work: {
            calligrapher: { name: "欧阳询" },
            title: "九成宫醴泉铭",
          },
        },
      },
    },
  },
};

describe("PrismaInsightsRepository", () => {
  it("deduplicates the same session stage even with a new event id", async () => {
    const prisma = {
      productEvent: {
        createMany: () => Promise.resolve({ count: 0 }),
        findFirst: () =>
          Promise.resolve({
            name: "PRACTICE_COMPLETED",
            occurredAt: new Date("2026-07-18T11:59:00.000Z"),
            practiceSessionId: "session-id",
            userId: "user-id",
          }),
      },
    };
    const repository = new PrismaInsightsRepository(prisma as never);
    const result = await repository.recordEvent({
      eventId: "event-id",
      name: "PRACTICE_COMPLETED",
      occurredAt: new Date("2026-07-18T12:00:00.000Z"),
      practiceSessionId: "session-id",
      userId: "user-id",
    });
    assert.equal(result, "DUPLICATE");
  });

  it("upserts a teacher opinion and appends an immutable audit", async () => {
    let auditData: Record<string, unknown> | null = null;
    const reviewedRow = {
      ...adviceRow,
      adviceReview: {
        comment: "证据与动作一致。",
        reviewerKey: "teacher@example.com",
        updatedAt: new Date("2026-07-18T12:05:00.000Z"),
        verdict: "APPROVED",
      },
    };
    const transaction = {
      adviceReview: { upsert: () => Promise.resolve({}) },
      contentAudit: {
        create: (input: { data: Record<string, unknown> }) => {
          auditData = input.data;
          return Promise.resolve({});
        },
      },
      practiceAttempt: {
        findFirst: () => Promise.resolve(adviceRow),
        findUniqueOrThrow: () => Promise.resolve(reviewedRow),
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaInsightsRepository(prisma as never);
    const result = await repository.saveAdviceReview({
      actorKey: "teacher@example.com",
      attemptId: "attempt-id",
      comment: "证据与动作一致。",
      now: new Date("2026-07-18T12:05:00.000Z"),
      verdict: "APPROVED",
    });

    assert.equal(result?.review?.verdict, "APPROVED");
    assert.equal(
      (auditData as { action?: string } | null)?.action,
      "REVIEW_ADVICE",
    );
  });
});
