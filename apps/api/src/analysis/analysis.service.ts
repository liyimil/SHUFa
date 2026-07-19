import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { sanitizeDiagnosticMessage } from "@calligraphy/observability";

import {
  ANALYSIS_REPOSITORY,
  type AnalysisRepository,
} from "./analysis.repository.js";
import type {
  ArtworkAnalysisView,
  QualityFailureInput,
  QualityFinding,
  QualityMetrics,
  QualityResultInput,
} from "./analysis.types.js";

const findingCodes = new Set([
  "BLURRY",
  "INK_TOUCHES_BORDER",
  "LOW_CONTRAST",
  "RESOLUTION_TOO_LOW",
  "TOO_BRIGHT",
  "TOO_DARK",
]);

@Injectable()
export class AnalysisService {
  constructor(
    @Inject(ANALYSIS_REPOSITORY)
    private readonly repository: AnalysisRepository,
  ) {}

  async getArtwork(
    artworkId: string,
    userId: string,
  ): Promise<ArtworkAnalysisView> {
    const artwork = await this.repository.findOwnedArtwork(artworkId, userId);
    if (!artwork) {
      throw new NotFoundException({
        code: "ARTWORK_NOT_FOUND",
        message: "没有找到这件作品。",
      });
    }
    return artwork;
  }

  async confirmCharacter(
    artworkId: string,
    userId: string,
    rawCharacter: unknown,
  ): Promise<{ character: string }> {
    const character =
      typeof rawCharacter === "string"
        ? rawCharacter.trim().normalize("NFC")
        : "";
    if (!/^\p{Script=Han}$/u.test(character)) {
      throw new BadRequestException({
        code: "INVALID_CHARACTER",
        message: "请输入一个汉字。",
      });
    }
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new BadRequestException({
        code: "INVALID_CHARACTER",
        message: "请输入一个汉字。",
      });
    }

    const result = await this.repository.confirmCharacter(
      artworkId,
      userId,
      character,
      `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
    );
    if (!result) {
      throw new NotFoundException({
        code: "ARTWORK_NOT_READY",
        message: "作品不存在或图片质检尚未通过。",
      });
    }
    return result;
  }

  async recordWorkerResult(
    analysisId: string,
    internalToken: string | undefined,
    rawInput: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    this.assertWorkerToken(internalToken);

    const input = this.validateResult(rawInput);
    const result = await this.repository.recordResult(analysisId, input, now);
    if (!result) {
      throw new NotFoundException({
        code: "ANALYSIS_NOT_FOUND",
        message: "没有找到分析任务。",
      });
    }
    return result;
  }

  async recordWorkerFailure(
    analysisId: string,
    internalToken: string | undefined,
    rawInput: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    this.assertWorkerToken(internalToken);
    const input = this.validateFailure(rawInput);
    const result = await this.repository.recordFailure(analysisId, input, now);
    if (!result) {
      throw new NotFoundException({
        code: "ANALYSIS_NOT_FOUND",
        message: "没有找到分析任务。",
      });
    }
    return result;
  }

  private assertWorkerToken(internalToken: string | undefined): void {
    const configuredToken = process.env.INTERNAL_WORKER_TOKEN;
    if (!configuredToken || internalToken !== configuredToken) {
      throw new UnauthorizedException({
        code: "INVALID_WORKER_TOKEN",
        message: "内部任务凭证无效。",
      });
    }
  }

  private validateFailure(raw: Record<string, unknown>): QualityFailureInput {
    if (
      raw.failureCode !== "QUALITY_ANALYSIS_FAILED" ||
      typeof raw.failureMessage !== "string" ||
      raw.failureMessage.trim().length === 0
    ) {
      throw new BadRequestException({
        code: "INVALID_ANALYSIS_FAILURE",
        message: "图片质检失败信息无效。",
      });
    }
    return {
      failureCode: "QUALITY_ANALYSIS_FAILED",
      failureMessage: sanitizeDiagnosticMessage(raw.failureMessage, 2_000),
    };
  }

  private validateResult(raw: Record<string, unknown>): QualityResultInput {
    const status = raw.status;
    const thresholdVersion = raw.threshold_version;
    const metrics = raw.metrics;
    const findings = raw.findings;
    if (
      (status !== "PASS" && status !== "RETAKE") ||
      typeof thresholdVersion !== "string" ||
      thresholdVersion.length === 0 ||
      !metrics ||
      typeof metrics !== "object" ||
      !Array.isArray(findings)
    ) {
      throw new BadRequestException({
        code: "INVALID_ANALYSIS_RESULT",
        message: "图片质检结果格式无效。",
      });
    }

    const requiredMetrics = [
      "blur_score",
      "brightness",
      "contrast",
      "edge_ink_ratio",
      "height",
      "ink_coverage",
      "width",
    ] as const;
    if (
      requiredMetrics.some(
        (key) => typeof (metrics as Record<string, unknown>)[key] !== "number",
      ) ||
      findings.some(
        (finding: unknown) =>
          !finding ||
          typeof finding !== "object" ||
          !findingCodes.has(
            String((finding as Record<string, unknown>).code ?? ""),
          ) ||
          typeof (finding as Record<string, unknown>).message !== "string" ||
          !["warning", "error"].includes(
            String((finding as Record<string, unknown>).severity ?? ""),
          ),
      )
    ) {
      throw new BadRequestException({
        code: "INVALID_ANALYSIS_RESULT",
        message: "图片质检指标或问题项格式无效。",
      });
    }

    return {
      findings: findings as QualityFinding[],
      metrics: metrics as QualityMetrics,
      status,
      threshold_version: thresholdVersion,
    };
  }
}
