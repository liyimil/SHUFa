ALTER TYPE "ContentAuditAction" ADD VALUE 'REVIEW_ADVICE';

CREATE TYPE "AdviceReviewVerdict" AS ENUM (
  'APPROVED',
  'NEEDS_ADJUSTMENT',
  'NOT_APPLICABLE'
);

CREATE TYPE "ProductEventName" AS ENUM (
  'ARTWORK_UPLOAD_COMPLETED',
  'CHARACTER_CONFIRMED',
  'CATALOG_RESULTS_VIEWED',
  'GLYPH_SELECTED',
  'PRACTICE_CREATED',
  'ADVICE_VIEWED',
  'SECOND_ATTEMPT_STARTED',
  'PRACTICE_COMPLETED'
);

CREATE TABLE "advice_reviews" (
  "id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "reviewer_key" VARCHAR(200) NOT NULL,
  "verdict" "AdviceReviewVerdict" NOT NULL,
  "comment" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "advice_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_events" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" "ProductEventName" NOT NULL,
  "practice_session_id" UUID,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "advice_reviews_attempt_id_key"
ON "advice_reviews"("attempt_id");

CREATE INDEX "advice_reviews_verdict_updated_at_idx"
ON "advice_reviews"("verdict", "updated_at");

CREATE INDEX "advice_reviews_reviewer_key_updated_at_idx"
ON "advice_reviews"("reviewer_key", "updated_at");

CREATE INDEX "product_events_name_occurred_at_idx"
ON "product_events"("name", "occurred_at");

CREATE INDEX "product_events_user_id_occurred_at_idx"
ON "product_events"("user_id", "occurred_at");

CREATE INDEX "product_events_practice_session_id_occurred_at_idx"
ON "product_events"("practice_session_id", "occurred_at");

CREATE UNIQUE INDEX "product_events_user_id_name_practice_session_id_key"
ON "product_events"("user_id", "name", "practice_session_id");

ALTER TABLE "advice_reviews"
ADD CONSTRAINT "advice_reviews_attempt_id_fkey"
FOREIGN KEY ("attempt_id") REFERENCES "practice_attempts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_events"
ADD CONSTRAINT "product_events_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_events"
ADD CONSTRAINT "product_events_practice_session_id_fkey"
FOREIGN KEY ("practice_session_id") REFERENCES "practice_sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
