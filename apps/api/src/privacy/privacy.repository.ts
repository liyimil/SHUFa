export const PRIVACY_REPOSITORY = Symbol("PRIVACY_REPOSITORY");

export interface PrivacyPreferencesRecord {
  allowArtworkStorage: boolean;
  allowModelTraining: boolean;
  allowPublicSharing: boolean;
  policyVersion: string;
  sharingUpdatedAt: Date;
  storageUpdatedAt: Date;
  trainingUpdatedAt: Date;
  updatedAt: Date;
}

export interface PrivacyRepository {
  getPreferences(userId: string): Promise<PrivacyPreferencesRecord>;
  updatePreferences(
    userId: string,
    changes: Partial<
      Pick<
        PrivacyPreferencesRecord,
        "allowArtworkStorage" | "allowModelTraining" | "allowPublicSharing"
      >
    >,
    policyVersion: string,
    now: Date,
  ): Promise<PrivacyPreferencesRecord>;
}
