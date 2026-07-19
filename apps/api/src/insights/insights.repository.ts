import type {
  AdviceReviewVerdict,
  AdviceSampleRecord,
  EventWriteResult,
  FunnelCount,
  ProductEventName,
} from "./insights.types.js";

export const INSIGHTS_REPOSITORY = Symbol("INSIGHTS_REPOSITORY");

export interface InsightsRepository {
  isOwnedPracticeSession(userId: string, sessionId: string): Promise<boolean>;
  listAdviceSamples(filters: {
    limit: number;
    status: "ALL" | "REVIEWED" | "UNREVIEWED";
  }): Promise<AdviceSampleRecord[]>;
  readFunnel(from: Date, to: Date): Promise<FunnelCount[]>;
  recordEvent(input: {
    eventId: string;
    name: ProductEventName;
    occurredAt: Date;
    practiceSessionId: string | null;
    userId: string;
  }): Promise<EventWriteResult>;
  saveAdviceReview(input: {
    actorKey: string;
    attemptId: string;
    comment: string;
    now: Date;
    verdict: AdviceReviewVerdict;
  }): Promise<AdviceSampleRecord | null>;
}
