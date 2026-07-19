import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException, ForbiddenException } from "@nestjs/common";

import type {
  PrivacyPreferencesRecord,
  PrivacyRepository,
} from "../src/privacy/privacy.repository.js";
import { PrivacyService } from "../src/privacy/privacy.service.js";

const now = new Date("2026-07-18T00:00:00.000Z");

class MemoryPrivacyRepository implements PrivacyRepository {
  record: PrivacyPreferencesRecord = {
    allowArtworkStorage: true,
    allowModelTraining: false,
    allowPublicSharing: false,
    policyVersion: "privacy-v1",
    sharingUpdatedAt: now,
    storageUpdatedAt: now,
    trainingUpdatedAt: now,
    updatedAt: now,
  };

  getPreferences() {
    return Promise.resolve(this.record);
  }

  updatePreferences(
    _userId: string,
    changes: Partial<PrivacyPreferencesRecord>,
    policyVersion: string,
    changedAt: Date,
  ) {
    this.record = {
      ...this.record,
      ...changes,
      policyVersion,
      updatedAt: changedAt,
    };
    return Promise.resolve(this.record);
  }
}

describe("PrivacyService", () => {
  it("keeps storage, public sharing and training consent independent", async () => {
    const repository = new MemoryPrivacyRepository();
    const service = new PrivacyService(repository);

    const result = await service.updatePreferences(
      "user-id",
      { allowModelTraining: true },
      new Date("2026-07-18T01:00:00.000Z"),
    );

    assert.equal(result.allowArtworkStorage, true);
    assert.equal(result.allowPublicSharing, false);
    assert.equal(result.allowModelTraining, true);
    assert.equal(result.policyVersion, "privacy-v1");
  });

  it("rejects malformed or empty privacy updates", async () => {
    const service = new PrivacyService(new MemoryPrivacyRepository());
    await assert.rejects(
      () => service.updatePreferences("user-id", {}),
      BadRequestException,
    );
    await assert.rejects(
      () =>
        service.updatePreferences("user-id", {
          allowModelTraining: "yes",
        }),
      BadRequestException,
    );
  });

  it("enforces withdrawn storage and public-sharing permissions", async () => {
    const repository = new MemoryPrivacyRepository();
    repository.record = {
      ...repository.record,
      allowArtworkStorage: false,
      allowPublicSharing: false,
    };
    const service = new PrivacyService(repository);

    await assert.rejects(
      () => service.assertArtworkStorageAllowed("user-id"),
      ForbiddenException,
    );
    await assert.rejects(
      () => service.assertPublicSharingAllowed("user-id"),
      ForbiddenException,
    );
  });
});
