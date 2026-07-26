export const IDENTITY_REPOSITORY = Symbol("IDENTITY_REPOSITORY");

export interface IdentityRepository {
  createAnonymousUserWithSession(input: {
    expiresAt: Date;
    refreshTokenHash: string;
  }): Promise<{ userId: string }>;
  createRegisteredUserWithSession(input: {
    expiresAt: Date;
    phoneHash: string;
    refreshTokenHash: string;
  }): Promise<{ userId: string }>;
  createSessionForUser(input: {
    expiresAt: Date;
    refreshTokenHash: string;
    userId: string;
  }): Promise<void>;
  findUserByPhoneHash(
    phoneHash: string,
  ): Promise<{ id: string; status: string } | null>;
  isActiveUser(userId: string): Promise<boolean>;
  revokeSession(refreshTokenHash: string, now: Date): Promise<void>;
  rotateSession(input: {
    currentRefreshTokenHash: string;
    newExpiresAt: Date;
    newRefreshTokenHash: string;
    now: Date;
  }): Promise<{ kind: "anonymous" | "registered"; userId: string } | null>;
  upgradeAnonymousWithSession(input: {
    currentRefreshTokenHash: string;
    newExpiresAt: Date;
    newRefreshTokenHash: string;
    now: Date;
    phoneHash: string;
  }): Promise<{ userId: string } | null>;
}
