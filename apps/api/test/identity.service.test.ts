import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JwtService } from "@nestjs/jwt";

import type { IdentityRepository } from "../src/identity/identity.repository.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  IdentityService,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../src/identity/identity.service.js";
import type { SmsProvider } from "../src/identity/sms.provider.js";
import type { AccessTokenPayload } from "../src/identity/identity.types.js";
import { VerificationCodeStore } from "../src/identity/verification-code.store.js";

const userId = "3fe537fd-6601-43f0-a31d-781bd5bde945";

class InMemoryIdentityRepository implements IdentityRepository {
  private currentHash: string | null = null;
  private revoked = false;

  createAnonymousUserWithSession(input: {
    expiresAt: Date;
    refreshTokenHash: string;
  }) {
    this.currentHash = input.refreshTokenHash;
    this.revoked = false;
    return Promise.resolve({ userId });
  }

  createRegisteredUserWithSession(input: {
    expiresAt: Date;
    phoneHash: string;
    refreshTokenHash: string;
  }) {
    this.currentHash = input.refreshTokenHash;
    this.revoked = false;
    return Promise.resolve({ userId });
  }

  createSessionForUser(input: {
    expiresAt: Date;
    refreshTokenHash: string;
    userId: string;
  }) {
    this.currentHash = input.refreshTokenHash;
    this.revoked = false;
    return Promise.resolve();
  }

  findUserByPhoneHash() {
    return Promise.resolve(null);
  }

  isActiveUser() {
    return Promise.resolve(true);
  }

  revokeSession(refreshTokenHash: string) {
    if (refreshTokenHash === this.currentHash) this.revoked = true;
    return Promise.resolve();
  }

  rotateSession(input: {
    currentRefreshTokenHash: string;
    newExpiresAt: Date;
    newRefreshTokenHash: string;
    now: Date;
  }) {
    if (this.revoked || input.currentRefreshTokenHash !== this.currentHash) {
      return Promise.resolve(null);
    }
    this.currentHash = input.newRefreshTokenHash;
    return Promise.resolve({ kind: "anonymous" as const, userId });
  }

  upgradeAnonymousWithSession() {
    return Promise.resolve(null);
  }
}

const mockSmsProvider: SmsProvider = {
  sendVerificationCode: () =>
    Promise.resolve({ messageId: "test", success: true }),
};

function createService(repository: IdentityRepository): {
  jwtService: JwtService;
  service: IdentityService;
} {
  const jwtService = new JwtService({
    secret: "test-secret-at-least-32-characters-long",
  });
  const codeStore = new VerificationCodeStore();
  return {
    jwtService,
    service: new IdentityService(
      repository,
      jwtService,
      mockSmsProvider,
      codeStore,
    ),
  };
}

describe("IdentityService", () => {
  it("creates a signed anonymous session with a refresh token", async () => {
    const { jwtService, service } = createService(
      new InMemoryIdentityRepository(),
    );

    const session = await service.createAnonymousSession();
    const payload = await jwtService.verifyAsync<AccessTokenPayload>(
      session.accessToken,
    );

    assert.equal(session.expiresInSeconds, ACCESS_TOKEN_TTL_SECONDS);
    assert.equal(session.refreshExpiresInSeconds, REFRESH_TOKEN_TTL_SECONDS);
    assert.match(session.refreshToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(session.tokenType, "Bearer");
    assert.deepEqual(session.user, { id: userId, kind: "anonymous" });
    assert.equal(payload.sub, userId);
    assert.equal(payload.kind, "anonymous");
  });

  it("rotates refresh tokens and rejects reuse of the previous token", async () => {
    const { service } = createService(new InMemoryIdentityRepository());
    const first = await service.createAnonymousSession();

    const second = await service.refreshSession(first.refreshToken);

    assert.notEqual(second.refreshToken, first.refreshToken);
    assert.deepEqual(second.user, first.user);
    await assert.rejects(
      () => service.refreshSession(first.refreshToken),
      /学习会话已过期/,
    );
  });

  it("revokes a refresh token without revealing whether it existed", async () => {
    const { service } = createService(new InMemoryIdentityRepository());
    const session = await service.createAnonymousSession();

    assert.deepEqual(await service.revokeSession(session.refreshToken), {
      revoked: true,
    });
    assert.deepEqual(await service.revokeSession("not-a-token"), {
      revoked: true,
    });
    await assert.rejects(
      () => service.refreshSession(session.refreshToken),
      /学习会话已过期/,
    );
  });
});
