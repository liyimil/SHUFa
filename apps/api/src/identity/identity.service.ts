import { createHash, randomBytes } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import {
  IDENTITY_REPOSITORY,
  type IdentityRepository,
} from "./identity.repository.js";
import { SMS_PROVIDER, type SmsProvider } from "./sms.provider.js";
import type {
  AccessTokenPayload,
  AuthenticatedUser,
  IdentitySession,
} from "./identity.types.js";
import { VerificationCodeStore, hashPhone } from "./verification-code.store.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const PHONE_CODE_EXPIRES_MINUTES = 5;

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
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(VerificationCodeStore)
    private readonly codeStore: VerificationCodeStore,
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

  async sendVerificationCode(phone: unknown): Promise<{ sent: true }> {
    const normalizedPhone = String(phone ?? "").trim();
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      throw new BadRequestException({
        code: "INVALID_PHONE_NUMBER",
        message: "手机号格式不正确。",
      });
    }

    const code = this.codeStore.generateCode();
    const phoneHash = hashPhone(normalizedPhone);
    this.codeStore.storeCode(phoneHash, code);

    try {
      const result = await this.smsProvider.sendVerificationCode(
        normalizedPhone,
        code,
        PHONE_CODE_EXPIRES_MINUTES,
      );
      if (!result.success) {
        throw new ServiceUnavailableException({
          code: "SMS_DELIVERY_FAILED",
          message: "The verification code could not be delivered.",
        });
      }
    } catch (error) {
      this.codeStore.deleteCode(phoneHash);
      throw error;
    }

    return { sent: true };
  }

  async verifyPhoneLogin(
    phone: unknown,
    code: unknown,
    anonymousRefreshToken?: unknown,
    now: Date = new Date(),
  ): Promise<IdentitySession> {
    const normalizedPhone = String(phone ?? "").trim();
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      throw new BadRequestException({
        code: "INVALID_PHONE_NUMBER",
        message: "手机号格式不正确。",
      });
    }

    const phoneHash = hashPhone(normalizedPhone);
    const verification = this.codeStore.verifyCode(
      phoneHash,
      String(code ?? "").trim(),
    );

    if (verification === "locked") {
      throw new BadRequestException({
        code: "CODE_LOCKED",
        message: "验证码尝试次数过多，请重新发送。",
      });
    }
    if (verification !== "valid") {
      throw new UnauthorizedException({
        code: "INVALID_CODE",
        message: "验证码无效或已过期。",
      });
    }

    const existingUser = await this.repository.findUserByPhoneHash(phoneHash);

    if (existingUser) {
      if (existingUser.status !== "ACTIVE") {
        throw new UnauthorizedException({
          code: "USER_DISABLED",
          message: "账号已被禁用。",
        });
      }
      const refreshToken = newRefreshToken();
      await this.repository.createSessionForUser({
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1_000),
        refreshTokenHash: digestRefreshToken(refreshToken),
        userId: existingUser.id,
      });
      return this.issueSession(
        { id: existingUser.id, kind: "registered" },
        refreshToken,
      );
    }

    if (anonymousRefreshToken) {
      const currentToken = String(anonymousRefreshToken).trim();
      if (!refreshTokenPattern.test(currentToken)) {
        throw this.invalidRefreshToken();
      }
      const refreshToken = newRefreshToken();
      const upgraded = await this.repository.upgradeAnonymousWithSession({
        currentRefreshTokenHash: digestRefreshToken(currentToken),
        newExpiresAt: new Date(
          now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1_000,
        ),
        newRefreshTokenHash: digestRefreshToken(refreshToken),
        now,
        phoneHash,
      });
      if (!upgraded) throw this.invalidRefreshToken();
      return this.issueSession(
        { id: upgraded.userId, kind: "registered" },
        refreshToken,
      );
    }

    const refreshToken = newRefreshToken();
    const user = await this.repository.createRegisteredUserWithSession({
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1_000),
      phoneHash,
      refreshTokenHash: digestRefreshToken(refreshToken),
    });
    return this.issueSession(
      { id: user.userId, kind: "registered" },
      refreshToken,
    );
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
