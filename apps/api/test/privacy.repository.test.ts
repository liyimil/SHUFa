import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaService } from "../src/database/prisma.service.js";
import { PrismaPrivacyRepository } from "../src/privacy/prisma-privacy.repository.js";

const now = new Date("2026-07-18T01:00:00.000Z");
const current = {
  allowArtworkStorage: true,
  allowModelTraining: false,
  allowPublicSharing: true,
  policyVersion: "privacy-v1",
  sharingUpdatedAt: new Date("2026-07-18T00:00:00.000Z"),
  storageUpdatedAt: new Date("2026-07-18T00:00:00.000Z"),
  trainingUpdatedAt: new Date("2026-07-18T00:00:00.000Z"),
  updatedAt: new Date("2026-07-18T00:00:00.000Z"),
};

describe("PrismaPrivacyRepository", () => {
  it("audits public withdrawal and revokes existing shares transactionally", async () => {
    let auditData: unknown = null;
    let revokedWhere: unknown = null;
    const prisma = {
      $transaction: (operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      shareLink: {
        updateMany: (input: { where: unknown }) => {
          revokedWhere = input.where;
          return Promise.resolve({ count: 2 });
        },
      },
      userConsentAudit: {
        createMany: (input: { data: unknown }) => {
          auditData = input.data;
          return Promise.resolve({ count: 1 });
        },
      },
      userPrivacyPreference: {
        update: () =>
          Promise.resolve({ ...current, allowPublicSharing: false }),
        upsert: () => Promise.resolve(current),
      },
    } as unknown as PrismaService;
    const repository = new PrismaPrivacyRepository(prisma);

    const updated = await repository.updatePreferences(
      "3fe537fd-6601-43f0-a31d-781bd5bde945",
      { allowPublicSharing: false },
      "privacy-v1",
      now,
    );

    assert.equal(updated.allowPublicSharing, false);
    assert.deepEqual(auditData, [
      {
        dimension: "PUBLIC_SHARING",
        enabled: false,
        policyVersion: "privacy-v1",
        userId: "3fe537fd-6601-43f0-a31d-781bd5bde945",
      },
    ]);
    assert.deepEqual(revokedWhere, {
      revokedAt: null,
      userId: "3fe537fd-6601-43f0-a31d-781bd5bde945",
    });
  });
});
