import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type { IdentityRepository } from "./identity.repository.js";

@Injectable()
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createAnonymousUserWithSession(input: {
    expiresAt: Date;
    refreshTokenHash: string;
  }): Promise<{ userId: string }> {
    const user = await this.prisma.user.create({
      data: {
        consentAudits: {
          createMany: {
            data: [
              {
                dimension: "STORAGE",
                enabled: true,
                policyVersion: "privacy-v1",
              },
              {
                dimension: "PUBLIC_SHARING",
                enabled: false,
                policyVersion: "privacy-v1",
              },
              {
                dimension: "MODEL_TRAINING",
                enabled: false,
                policyVersion: "privacy-v1",
              },
            ],
          },
        },
        privacyPreference: {
          create: { policyVersion: "privacy-v1" },
        },
        sessions: {
          create: {
            expiresAt: input.expiresAt,
            refreshTokenHash: input.refreshTokenHash,
          },
        },
      },
      select: { id: true },
    });
    return { userId: user.id };
  }

  async createSessionForUser(input: {
    expiresAt: Date;
    refreshTokenHash: string;
    userId: string;
  }): Promise<void> {
    await this.prisma.userSession.create({ data: input });
  }

  async isActiveUser(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: "ACTIVE" },
      select: { id: true },
    });

    return user !== null;
  }

  async rotateSession(input: {
    currentRefreshTokenHash: string;
    newExpiresAt: Date;
    newRefreshTokenHash: string;
    now: Date;
  }): Promise<{ kind: "anonymous" | "registered"; userId: string } | null> {
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.userSession.findFirst({
        where: {
          expiresAt: { gt: input.now },
          refreshTokenHash: input.currentRefreshTokenHash,
          revokedAt: null,
          user: { status: "ACTIVE" },
        },
        select: { id: true, user: { select: { id: true, phoneHash: true } } },
      });
      if (!session) return null;

      const rotated = await transaction.userSession.updateMany({
        data: {
          expiresAt: input.newExpiresAt,
          lastUsedAt: input.now,
          refreshTokenHash: input.newRefreshTokenHash,
        },
        where: {
          expiresAt: { gt: input.now },
          id: session.id,
          refreshTokenHash: input.currentRefreshTokenHash,
          revokedAt: null,
        },
      });
      if (rotated.count !== 1) return null;

      return {
        kind: session.user.phoneHash ? "registered" : "anonymous",
        userId: session.user.id,
      };
    });
  }

  async revokeSession(refreshTokenHash: string, now: Date): Promise<void> {
    await this.prisma.userSession.updateMany({
      data: { revokedAt: now },
      where: { refreshTokenHash, revokedAt: null },
    });
  }
}
