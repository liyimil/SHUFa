CREATE TYPE "FeedbackKind" AS ENUM ('STRUCTURE_ADVICE', 'QUALITY_RESULT', 'CONTENT_ERROR', 'PRODUCT');
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TABLE "user_feedback" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "reference_type" VARCHAR(100),
    "reference_id" UUID,
    "accurate" BOOLEAN,
    "message" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_feedback_status_created_at_idx" ON "user_feedback"("status", "created_at");
CREATE INDEX "user_feedback_user_id_created_at_idx" ON "user_feedback"("user_id", "created_at");
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
