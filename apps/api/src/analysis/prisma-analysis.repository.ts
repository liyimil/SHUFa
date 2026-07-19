import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { AnalysisRepository } from "./analysis.repository.js";
import type {
  AnalysisStatus,
  ArtworkAnalysisView,
  QualityFailureInput,
  QualityFinding,
  QualityMetrics,
  QualityResultInput,
} from "./analysis.types.js";

@Injectable()
export class PrismaAnalysisRepository implements AnalysisRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async confirmCharacter(
    artworkId: string,
    userId: string,
    character: string,
    unicodeCodePoint: string,
  ): Promise<{ character: string } | null> {
    const artwork = await this.prisma.userArtwork.findFirst({
      where: { id: artworkId, status: "READY", userId },
      select: { id: true },
    });
    if (!artwork) {
      return null;
    }

    const confirmedCharacter = await this.prisma.character.upsert({
      create: { unicodeCodePoint, value: character },
      update: {},
      where: { value: character },
      select: { id: true, value: true },
    });
    await this.prisma.userArtwork.update({
      data: { confirmedCharacterId: confirmedCharacter.id },
      where: { id: artwork.id },
    });
    return { character: confirmedCharacter.value };
  }

  async findOwnedArtwork(
    artworkId: string,
    userId: string,
  ): Promise<ArtworkAnalysisView | null> {
    const artwork = await this.prisma.userArtwork.findFirst({
      where: { id: artworkId, userId },
      select: {
        analysis: {
          select: {
            findings: true,
            metrics: true,
            status: true,
            thresholdVersion: true,
          },
        },
        confirmedCharacter: { select: { value: true } },
        createdAt: true,
        id: true,
        status: true,
      },
    });
    if (!artwork) {
      return null;
    }

    return {
      analysis: artwork.analysis
        ? {
            findings: (artwork.analysis.findings ??
              []) as unknown as QualityFinding[],
            metrics: artwork.analysis
              .metrics as unknown as QualityMetrics | null,
            status: artwork.analysis.status as AnalysisStatus,
            thresholdVersion: artwork.analysis.thresholdVersion,
          }
        : null,
      artworkId: artwork.id,
      artworkStatus: artwork.status,
      confirmedCharacter: artwork.confirmedCharacter?.value ?? null,
      createdAt: artwork.createdAt.toISOString(),
    };
  }

  async recordFailure(
    analysisId: string,
    input: QualityFailureInput,
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const analysis = await transaction.artworkAnalysis.findUnique({
        where: { id: analysisId },
        select: { artworkId: true, status: true },
      });
      if (!analysis) return null;
      if (["PASSED", "NEEDS_RETAKE", "FAILED"].includes(analysis.status)) {
        return {
          artworkId: analysis.artworkId,
          status: analysis.status as AnalysisStatus,
        };
      }

      const claimed = await transaction.artworkAnalysis.updateMany({
        data: {
          attempts: { increment: 1 },
          completedAt: now,
          failureCode: input.failureCode,
          failureMessage: input.failureMessage,
          status: "FAILED",
        },
        where: {
          id: analysisId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });
      if (claimed.count !== 1) return null;
      await transaction.userArtwork.updateMany({
        data: { failureCode: input.failureCode, status: "READY" },
        where: { id: analysis.artworkId, status: "PROCESSING" },
      });
      return { artworkId: analysis.artworkId, status: "FAILED" as const };
    });
  }

  async recordResult(analysisId: string, input: QualityResultInput, now: Date) {
    const status: AnalysisStatus =
      input.status === "PASS" ? "PASSED" : "NEEDS_RETAKE";
    return this.prisma.$transaction(async (transaction) => {
      const analysis = await transaction.artworkAnalysis.findUnique({
        where: { id: analysisId },
        select: { artworkId: true, status: true },
      });
      if (!analysis) return null;
      if (["PASSED", "NEEDS_RETAKE", "FAILED"].includes(analysis.status)) {
        return {
          artworkId: analysis.artworkId,
          status: analysis.status as AnalysisStatus,
        };
      }

      const claimed = await transaction.artworkAnalysis.updateMany({
        data: {
          attempts: { increment: 1 },
          completedAt: now,
          failureCode: null,
          failureMessage: null,
          findings: input.findings as unknown as Prisma.InputJsonValue,
          metrics: input.metrics as unknown as Prisma.InputJsonValue,
          status,
          thresholdVersion: input.threshold_version,
        },
        where: {
          id: analysisId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });
      if (claimed.count !== 1) return null;
      await transaction.userArtwork.update({
        data: {
          failureCode: input.status === "RETAKE" ? "QUALITY_RETAKE" : null,
          status: input.status === "PASS" ? "READY" : "FAILED",
        },
        where: { id: analysis.artworkId },
      });
      return { artworkId: analysis.artworkId, status };
    });
  }
}
