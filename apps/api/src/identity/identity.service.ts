import { createHash, randomBytes } from "node:crypto";

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import {
  IDENTITY_REPOSITORY,
  type IdentityRepository,
} from "./identity.repository.js";
import type {
  AccessTokenPayload,
  AuthenticatedUser,
  IdentitySession,
} from "./identity.types.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const refreshTokenPattern = /^[A-Za-z0-9_-]{43}$/;

function digestRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class IdentityService {
  constructor(
    @Inject(IDENTITY_REPOSITORY)
    private readonly repository: IdentityRepository,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  async createAnonymousSession(
    now: Date = new Date(),
  ): Promise<IdentitySession> {
    const refreshToken = newRefreshToken();
    const user = await this.repository.createAnonymousUserWithSession({
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1_000),
      refreshTokenHash: digestRefreshToken(refreshToken),
    });
    return this.issueSession(
      { id: user.userId, kind: "anonymous" },
      refreshToken,
    );
  }

  async createRefreshableSession(
    user: AuthenticatedUser,
    now: Date = new Date(),
  ): Promise<IdentitySession> {
    const refreshToken = newRefreshToken();
    await this.repository.createSessionForUser({
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1_000),
      refreshTokenHash: digestRefreshToken(refreshToken),
      userId: user.id,
    });
    return this.issueSession(user, refreshToken);
  }

  async refreshSession(
    rawRefreshToken: unknown,
    now: Date = new Date(),
  ): Promise<IdentitySession> {
    const currentToken = String(rawRefreshToken ?? "").trim();
    if (!refreshTokenPattern.test(currentToken)) {
      throw this.invalidRefreshToken();
    }
    const nextToken = newRefreshToken();
    const user = await this.repository.rotateSession({
      currentRefreshTokenHash: digestRefreshToken(currentToken),
      newExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1_000),
      newRefreshTokenHash: digestRefreshToken(nextToken),
      now,
    });
    if (!user) throw this.invalidRefreshToken();
    return this.issueSession({ id: user.userId, kind: user.kind }, nextToken);
  }

  async revokeSession(rawRefreshToken: unknown, now: Date = new Date()) {
    const token = String(rawRefreshToken ?? "").trim();
    if (refreshTokenPattern.test(token)) {
      await this.repository.revokeSession(digestRefreshToken(token), now);
    }
    return { revoked: true as const };
  }

  private async issueSession(
    user: AuthenticatedUser,
    refreshToken: string,
  ): Promise<IdentitySession> {
    const payload: AccessTokenPayload = { kind: user.kind, sub: user.id };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    return {
      accessToken,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresInSeconds: REFRESH_TOKEN_TTL_SECONDS,
      refreshToken,
      tokenType: "Bearer",
      user,
    };
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: "INVALID_REFRESH_TOKEN",
      message: "学习会话已过期，请重新开始匿名会话。",
    });
  }
}
