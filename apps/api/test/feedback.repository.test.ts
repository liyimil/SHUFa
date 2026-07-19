import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaFeedbackRepository } from "../src/feedback/prisma-feedback.repository.js";

describe("PrismaFeedbackRepository", () => {
  it("scopes artwork feedback references to the submitting user", async () => {
    const queries: Array<Record<string, unknown>> = [];
    const prisma = {
      userArtwork: {
        findFirst: (input: Record<string, unknown>) => {
          queries.push(input);
          return Promise.resolve({ id: "artwork-id" });
        },
      },
    };
    const repository = new PrismaFeedbackRepository(prisma as never);
    const valid = await repository.isValidReference(
      "user-id",
      "RECOGNITION_ERROR",
      "artwork-id",
    );
    assert.equal(valid, true);
    assert.deepEqual(queries[0]?.where, {
      id: "artwork-id",
      status: { not: "DELETED" },
      userId: "user-id",
    });
  });

  it("never exposes the internal assignee in a user's feedback list", async () => {
    const queries: Array<{
      select?: Record<string, boolean>;
      where?: unknown;
    }> = [];
    const prisma = {
      userFeedback: {
        findMany: (input: (typeof queries)[number]) => {
          queries.push(input);
          return Promise.resolve([]);
        },
      },
    };
    const repository = new PrismaFeedbackRepository(prisma as never);
    await repository.listByUser("user-id");
    assert.equal(Object.hasOwn(queries[0]?.select ?? {}, "assignedTo"), false);
    assert.deepEqual(queries[0]?.where, { userId: "user-id" });
  });

  it("resolves a ticket transactionally and records before/after audit", async () => {
    const now = new Date("2026-07-18T02:00:00.000Z");
    let updateData: Record<string, unknown> | null = null;
    let auditData: Record<string, unknown> | null = null;
    const current = {
      accurate: null,
      assignedTo: null,
      createdAt: new Date("2026-07-18T00:00:00.000Z"),
      id: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      kind: "CONTENT_ERROR",
      message: "出处错误",
      referenceId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
      referenceType: "Glyph",
      resolutionNote: null,
      resolvedAt: null,
      status: "OPEN",
      updatedAt: new Date("2026-07-18T00:00:00.000Z"),
    };
    const transaction = {
      contentAudit: {
        create: (input: { data: Record<string, unknown> }) => {
          auditData = input.data;
          return Promise.resolve(input.data);
        },
      },
      userFeedback: {
        findUnique: () => Promise.resolve(current),
        update: (input: {
          data: Record<string, unknown>;
          select: unknown;
          where: unknown;
        }) => {
          updateData = input.data;
          return Promise.resolve({ ...current, ...input.data, updatedAt: now });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaFeedbackRepository(prisma as never);
    const updated = await repository.updateByAdmin(
      "reviewer@example.com",
      current.id,
      {
        assignedTo: "editor@example.com",
        resolutionNote: "已修正并重新发布。",
        status: "RESOLVED",
      },
      now,
    );
    assert.equal(updated?.status, "RESOLVED");
    assert.equal((updateData as { resolvedAt?: Date } | null)?.resolvedAt, now);
    assert.equal(
      (auditData as { action?: string } | null)?.action,
      "UPDATE_FEEDBACK",
    );
    assert.deepEqual(
      (
        auditData as {
          snapshot?: { before: unknown; after: unknown };
        } | null
      )?.snapshot,
      {
        after: {
          assignedTo: "editor@example.com",
          resolutionNote: "已修正并重新发布。",
          status: "RESOLVED",
        },
        before: {
          assignedTo: null,
          resolutionNote: null,
          status: "OPEN",
        },
      },
    );
  });
});
