import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type {
  PrivacyPreferencesRecord,
  PrivacyRepository,
} from "./privacy.repository.js";

const privacySelect = {
  allowArtworkStorage: true,
  allowModelTraining: true,
  allowPublicSharing: true,
  policyVersion: true,
  sharingUpdatedAt: true,
  storageUpdatedAt: true,
  trainingUpdatedAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaPrivacyRepository implements PrivacyRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getPreferences(userId: string): Promise<PrivacyPreferencesRecord> {
    return this.prisma.userPrivacyPreference.upsert({
      create: { policyVersion: "privacy-v1", userId },
      select: privacySelect,
      update: {},
      where: { userId },
    });
  }

  async updatePreferences(
    userId: string,
    changes: Partial<
      Pick<
        PrivacyPreferencesRecord,
        "allowArtworkStorage" | "allowModelTraining" | "allowPublicSharing"
      >
    >,
    policyVersion: string,
    now: Date,
  ): Promise<PrivacyPreferencesRecord> {
    const current = await this.getPreferences(userId);
    const data: {
      allowArtworkStorage?: boolean;
      allowModelTraining?: boolean;
      allowPublicSharing?: boolean;
      policyVersion: string;
      sharingUpdatedAt?: Date;
      storageUpdatedAt?: Date;
      trainingUpdatedAt?: Date;
    } = { policyVersion };
    const audits: Array<{
      dimension: "STORAGE" | "PUBLIC_SHARING" | "MODEL_TRAINING";
      enabled: boolean;
      policyVersion: string;
      userId: string;
    }> = [];

    if (
      changes.allowArtworkStorage !== undefined &&
      changes.allowArtworkStorage !== current.allowArtworkStorage
    ) {
      data.allowArtworkStorage = changes.allowArtworkStorage;
      data.storageUpdatedAt = now;
      audits.push({
        dimension: "STORAGE",
        enabled: changes.allowArtworkStorage,
        policyVersion,
        userId,
      });
    }
    if (
      changes.allowPublicSharing !== undefined &&
      changes.allowPublicSharing !== current.allowPublicSharing
    ) {
      data.allowPublicSharing = changes.allowPublicSharing;
      data.sharingUpdatedAt = now;
      audits.push({
        dimension: "PUBLIC_SHARING",
        enabled: changes.allowPublicSharing,
        policyVersion,
        userId,
      });
    }
    if (
      changes.allowModelTraining !== undefined &&
      changes.allowModelTraining !== current.allowModelTraining
    ) {
      data.allowModelTraining = changes.allowModelTraining;
      data.trainingUpdatedAt = now;
      audits.push({
        dimension: "MODEL_TRAINING",
        enabled: changes.allowModelTraining,
        policyVersion,
        userId,
      });
    }
    if (audits.length === 0) return current;

    const operations = [
      this.prisma.userPrivacyPreference.update({
        data,
        select: privacySelect,
        where: { userId },
      }),
      this.prisma.userConsentAudit.createMany({ data: audits }),
    ];
    if (data.allowPublicSharing === false) {
      operations.push(
        this.prisma.shareLink.updateMany({
          data: { revokedAt: now },
          where: { revokedAt: null, userId },
        }),
      );
    }
    const [updated] = await this.prisma.$transaction(operations);
    return updated as PrivacyPreferencesRecord;
  }
}
