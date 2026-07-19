import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";

import {
  PRIVACY_REPOSITORY,
  type PrivacyPreferencesRecord,
  type PrivacyRepository,
} from "./privacy.repository.js";

export const CURRENT_PRIVACY_POLICY_VERSION = "privacy-v1";

export interface PrivacyPreferencesView {
  allowArtworkStorage: boolean;
  allowModelTraining: boolean;
  allowPublicSharing: boolean;
  policyVersion: string;
  sharingUpdatedAt: string;
  storageUpdatedAt: string;
  trainingUpdatedAt: string;
  updatedAt: string;
}

@Injectable()
export class PrivacyService {
  constructor(
    @Inject(PRIVACY_REPOSITORY)
    private readonly repository: PrivacyRepository,
  ) {}

  async getPreferences(userId: string): Promise<PrivacyPreferencesView> {
    return this.toView(await this.repository.getPreferences(userId));
  }

  async updatePreferences(
    userId: string,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ): Promise<PrivacyPreferencesView> {
    const changes: {
      allowArtworkStorage?: boolean;
      allowModelTraining?: boolean;
      allowPublicSharing?: boolean;
    } = {};
    for (const key of [
      "allowArtworkStorage",
      "allowPublicSharing",
      "allowModelTraining",
    ] as const) {
      if (Object.hasOwn(raw, key)) {
        if (typeof raw[key] !== "boolean") {
          throw new BadRequestException({ code: "INVALID_PRIVACY_PREFERENCE" });
        }
        changes[key] = raw[key];
      }
    }
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException({ code: "EMPTY_PRIVACY_UPDATE" });
    }
    return this.toView(
      await this.repository.updatePreferences(
        userId,
        changes,
        CURRENT_PRIVACY_POLICY_VERSION,
        now,
      ),
    );
  }

  async assertArtworkStorageAllowed(userId: string): Promise<void> {
    const preferences = await this.repository.getPreferences(userId);
    if (!preferences.allowArtworkStorage) {
      throw new ForbiddenException({
        code: "ARTWORK_STORAGE_DISABLED",
        message: "你已关闭作品存储，请先在隐私设置中重新允许。",
      });
    }
  }

  async assertPublicSharingAllowed(userId: string): Promise<void> {
    const preferences = await this.repository.getPreferences(userId);
    if (!preferences.allowPublicSharing) {
      throw new ForbiddenException({
        code: "PUBLIC_SHARING_DISABLED",
        message: "你尚未允许公开分享，请先在隐私设置中开启。",
      });
    }
  }

  private toView(record: PrivacyPreferencesRecord): PrivacyPreferencesView {
    return {
      allowArtworkStorage: record.allowArtworkStorage,
      allowModelTraining: record.allowModelTraining,
      allowPublicSharing: record.allowPublicSharing,
      policyVersion: record.policyVersion,
      sharingUpdatedAt: record.sharingUpdatedAt.toISOString(),
      storageUpdatedAt: record.storageUpdatedAt.toISOString(),
      trainingUpdatedAt: record.trainingUpdatedAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
