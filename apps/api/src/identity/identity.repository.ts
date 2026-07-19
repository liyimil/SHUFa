export const IDENTITY_REPOSITORY = Symbol("IDENTITY_REPOSITORY");

export interface IdentityRepository {
  createAnonymousUserWithSession(input: {
    expiresAt: Date;
    refreshTokenHash: string;
  }): Promise<{ userId: string }>;
  createSessionForUser(input: {
    expiresAt: Date;
    refreshTokenHash: string;
    userId: string;
  }): Promise<void>;
  isActiveUser(userId: string): Promise<boolean>;
  revokeSession(refreshTokenHash: string, now: Date): Promise<void>;
  rotateSession(input: {
    currentRefreshTokenHash: string;
    newExpiresAt: Date;
    newRefreshTokenHash: string;
    now: Date;
  }): Promise<{ kind: "anonymous" | "registered"; userId: string } | null>;
}
