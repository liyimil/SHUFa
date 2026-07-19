CREATE TYPE "PracticeAnalysisStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE TABLE "practice_analysis_runs" (
  "id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "status" "PracticeAnalysisStatus" NOT NULL DEFAULT 'PENDING',
  "user_object_key" VARCHAR(1000) NOT NULL,
  "master_object_key" VARCHAR(1000) NOT NULL,
  "user_checksum_sha256" CHAR(64),
  "master_checksum_sha256" CHAR(64),
  "normalization_version" VARCHAR(100),
  "measurement_version" VARCHAR(100),
  "rule_version" VARCHAR(100),
  "model_version" VARCHAR(100),
  "result_snapshot" JSONB,
  "failure_code" VARCHAR(100),
  "failure_message" TEXT,
  "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "practice_analysis_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practice_analysis_runs_attempt_id_key"
ON "practice_analysis_runs"("attempt_id");

CREATE INDEX "practice_analysis_runs_status_queued_at_idx"
ON "practice_analysis_runs"("status", "queued_at");

CREATE INDEX "practice_analysis_runs_model_version_rule_version_idx"
ON "practice_analysis_runs"("model_version", "rule_version");

ALTER TABLE "practice_analysis_runs"
ADD CONSTRAINT "practice_analysis_runs_attempt_id_fkey"
FOREIGN KEY ("attempt_id") REFERENCES "practice_attempts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
