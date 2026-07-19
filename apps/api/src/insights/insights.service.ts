import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../upload/object-storage.js";
import {
  INSIGHTS_REPOSITORY,
  type InsightsRepository,
} from "./insights.repository.js";
import {
  adviceReviewVerdicts,
  type AdviceReviewVerdict,
  productEventNames,
  type ProductEventName,
} from "./insights.types.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sessionRequiredEvents = new Set<ProductEventName>([
  "PRACTICE_CREATED",
  "ADVICE_VIEWED",
  "SECOND_ATTEMPT_STARTED",
  "PRACTICE_COMPLETED",
]);
const maximumEventAgeMs = 7 * 24 * 60 * 60 * 1_000;
const maximumFutureSkewMs = 5 * 60 * 1_000;
const maximumFunnelWindowMs = 90 * 24 * 60 * 60 * 1_000;

function publicAssetUrl(objectKey: string): string {
  const base = (
    process.env.PUBLIC_ASSET_BASE_URL ??
    "http://localhost:9000/calligraphy-public"
  ).replace(/\/$/, "");
  return `${base}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

function validDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

@Injectable()
export class InsightsService {
  constructor(
    @Inject(INSIGHTS_REPOSITORY)
    private readonly repository: InsightsRepository,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
  ) {}

  async trackEvent(
    userId: string,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    const eventId = typeof raw.eventId === "string" ? raw.eventId : "";
    const name = String(raw.name ?? "") as ProductEventName;
    const occurredAt = validDate(raw.occurredAt);
    const practiceSessionId =
      raw.practiceSessionId == null ? null : String(raw.practiceSessionId);
    if (!uuidPattern.test(eventId) || !productEventNames.includes(name)) {
      throw new BadRequestException({ code: "INVALID_PRODUCT_EVENT" });
    }
    if (
      !occurredAt ||
      occurredAt.getTime() < now.getTime() - maximumEventAgeMs ||
      occurredAt.getTime() > now.getTime() + maximumFutureSkewMs
    ) {
      throw new BadRequestException({ code: "INVALID_EVENT_TIME" });
    }
    if (
      (practiceSessionId !== null && !uuidPattern.test(practiceSessionId)) ||
      (sessionRequiredEvents.has(name) && practiceSessionId === null)
    ) {
      throw new BadRequestException({ code: "INVALID_EVENT_REFERENCE" });
    }
    if (
      practiceSessionId &&
      !(await this.repository.isOwnedPracticeSession(userId, practiceSessionId))
    ) {
      throw new BadRequestException({ code: "INVALID_EVENT_REFERENCE" });
    }
    const result = await this.repository.recordEvent({
      eventId,
      name,
      occurredAt,
      practiceSessionId,
      userId,
    });
    if (result === "CONFLICT") {
      throw new ConflictException({ code: "EVENT_ID_CONFLICT" });
    }
    return { eventId, status: result === "CREATED" ? "RECORDED" : "DUPLICATE" };
  }

  async listAdviceSamples(raw: Record<string, unknown>) {
    const status = String(raw.status ?? "UNREVIEWED") as
      "ALL" | "REVIEWED" | "UNREVIEWED";
    const limit = raw.limit === undefined ? 20 : Number(raw.limit);
    if (
      !["ALL", "REVIEWED", "UNREVIEWED"].includes(status) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      throw new BadRequestException({ code: "INVALID_ADVICE_SAMPLE_FILTER" });
    }
    const samples = await this.repository.listAdviceSamples({ limit, status });
    return Promise.all(
      samples.map(async (sample) => ({
        advice: sample.advice,
        attemptCreatedAt: sample.attemptCreatedAt.toISOString(),
        attemptId: sample.attemptId,
        character: sample.character,
        master: {
          calligrapherName: sample.master.calligrapherName,
          imageUrl: sample.master.imageObjectKey
            ? publicAssetUrl(sample.master.imageObjectKey)
            : null,
          workTitle: sample.master.workTitle,
        },
        practiceSessionId: sample.practiceSessionId,
        review: sample.review
          ? {
              ...sample.review,
              reviewedAt: sample.review.reviewedAt.toISOString(),
            }
          : null,
        sequence: sample.sequence,
        userImageUrl: await this.objectStorage.createDownloadUrl({
          expiresInSeconds: 5 * 60,
          objectKey: sample.userImageObjectKey,
        }),
      })),
    );
  }

  async reviewAdvice(
    actorKey: string,
    attemptId: string,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    const verdict = String(raw.verdict ?? "") as AdviceReviewVerdict;
    const comment = typeof raw.comment === "string" ? raw.comment.trim() : "";
    if (!uuidPattern.test(attemptId)) {
      throw new BadRequestException({ code: "INVALID_ADVICE_ATTEMPT" });
    }
    if (
      !adviceReviewVerdicts.includes(verdict) ||
      comment.length < 3 ||
      comment.length > 2_000
    ) {
      throw new BadRequestException({ code: "INVALID_ADVICE_REVIEW" });
    }
    const saved = await this.repository.saveAdviceReview({
      actorKey,
      attemptId,
      comment,
      now,
      verdict,
    });
    if (!saved) {
      throw new NotFoundException({ code: "ADVICE_SAMPLE_NOT_FOUND" });
    }
    return { attemptId, status: "REVIEWED" as const, verdict };
  }

  async funnel(raw: Record<string, unknown>, now: Date = new Date()) {
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const from = raw.from === undefined ? defaultFrom : validDate(raw.from);
    const to = raw.to === undefined ? now : validDate(raw.to);
    if (
      !from ||
      !to ||
      from >= to ||
      to.getTime() > now.getTime() + maximumFutureSkewMs ||
      to.getTime() - from.getTime() > maximumFunnelWindowMs
    ) {
      throw new BadRequestException({ code: "INVALID_FUNNEL_WINDOW" });
    }
    const counts = new Map(
      (await this.repository.readFunnel(from, to)).map((item) => [
        item.name,
        item.count,
      ]),
    );
    const stages = productEventNames.map((name, index) => {
      const count = counts.get(name) ?? 0;
      const previousCount =
        index === 0 ? null : (counts.get(productEventNames[index - 1]!) ?? 0);
      return {
        conversionFromPrevious:
          previousCount === null || previousCount === 0
            ? null
            : count / previousCount,
        count,
        name,
      };
    });
    const firstCount = stages[0]?.count ?? 0;
    const completedCount = stages.at(-1)?.count ?? 0;
    return {
      completionRate: firstCount === 0 ? null : completedCount / firstCount,
      from: from.toISOString(),
      stages,
      to: to.toISOString(),
    };
  }
}
