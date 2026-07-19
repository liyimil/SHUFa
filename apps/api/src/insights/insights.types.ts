export const adviceReviewVerdicts = [
  "APPROVED",
  "NEEDS_ADJUSTMENT",
  "NOT_APPLICABLE",
] as const;
export type AdviceReviewVerdict = (typeof adviceReviewVerdicts)[number];

export const productEventNames = [
  "ARTWORK_UPLOAD_COMPLETED",
  "CHARACTER_CONFIRMED",
  "CATALOG_RESULTS_VIEWED",
  "GLYPH_SELECTED",
  "PRACTICE_CREATED",
  "ADVICE_VIEWED",
  "SECOND_ATTEMPT_STARTED",
  "PRACTICE_COMPLETED",
] as const;
export type ProductEventName = (typeof productEventNames)[number];

export interface AdviceSampleRecord {
  advice: Record<string, unknown>;
  attemptCreatedAt: Date;
  attemptId: string;
  character: string;
  master: {
    calligrapherName: string;
    imageObjectKey: string | null;
    workTitle: string;
  };
  practiceSessionId: string;
  review: {
    comment: string;
    reviewedAt: Date;
    reviewerKey: string;
    verdict: AdviceReviewVerdict;
  } | null;
  sequence: number;
  userImageObjectKey: string;
}

export interface FunnelCount {
  count: number;
  name: ProductEventName;
}

export type EventWriteResult = "CREATED" | "DUPLICATE" | "CONFLICT";
