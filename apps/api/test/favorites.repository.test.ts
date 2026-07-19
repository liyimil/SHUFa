import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PrismaPracticeRepository } from "../src/practice/prisma-practice.repository.js";

const glyphId = "3fe537fd-6601-43f0-a31d-781bd5bde945";
const groupId = "53a3e68c-c38c-4b79-90b4-ab1212491184";
const now = new Date("2026-07-18T12:00:00.000Z");

describe("PrismaPracticeRepository favorites", () => {
  it("favorites only a currently publishable glyph and appends it to its group", async () => {
    const glyphWheres: Array<Record<string, unknown>> = [];
    const upserts: Array<Record<string, unknown>> = [];
    const transaction = {
      favoriteGlyph: {
        aggregate: () => Promise.resolve({ _max: { sortOrder: 2 } }),
        findUnique: () => Promise.resolve(null),
        upsert: (input: { create: Record<string, unknown> }) => {
          upserts.push(input.create);
          return Promise.resolve({});
        },
      },
      favoriteGroup: {
        findFirst: () => Promise.resolve({ id: groupId }),
      },
      glyph: {
        findFirst: (input: { where: Record<string, unknown> }) => {
          glyphWheres.push(input.where);
          return Promise.resolve({ id: glyphId });
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaPracticeRepository(prisma as never);

    const created = await repository.createFavorite(
      "user-id",
      glyphId,
      groupId,
      now,
    );

    assert.equal(created, true);
    assert.equal(glyphWheres[0]?.id, glyphId);
    assert.deepEqual(
      (glyphWheres[0]?.authenticityGrade as { not: string } | undefined)?.not,
      "D_AI_GENERATED",
    );
    assert.equal(upserts[0]?.groupId, groupId);
    assert.equal(upserts[0]?.sortOrder, 3);
  });

  it("normalizes sibling order after a stable one-step move", async () => {
    const writes: Array<{ id: string; sortOrder: number }> = [];
    const transaction = {
      favoriteGlyph: {
        findMany: () =>
          Promise.resolve([{ id: "a" }, { id: "b" }, { id: "c" }]),
        findUnique: () => Promise.resolve({ groupId, id: "b" }),
        update: (input: {
          data: { sortOrder: number };
          where: { id: string };
        }) => {
          writes.push({ id: input.where.id, sortOrder: input.data.sortOrder });
          return Promise.resolve({});
        },
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    };
    const repository = new PrismaPracticeRepository(prisma as never);

    const reordered = await repository.reorderFavorite(
      "user-id",
      glyphId,
      "UP",
    );

    assert.equal(reordered, true);
    assert.deepEqual(writes, [
      { id: "b", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "c", sortOrder: 2 },
    ]);
  });
});
