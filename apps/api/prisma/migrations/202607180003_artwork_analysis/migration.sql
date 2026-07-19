-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'PASSED', 'NEEDS_RETAKE', 'FAILED');

-- CreateTable
CREATE TABLE "artwork_analyses" (
    "id" UUID NOT NULL,
    "artwork_id" UUID NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "threshold_version" VARCHAR(50),
    "metrics" JSONB,
    "findings" JSONB,
    "failure_code" VARCHAR(100),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "artwork_analyses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artwork_analyses_artwork_id_key" ON "artwork_analyses"("artwork_id");
CREATE INDEX "artwork_analyses_status_created_at_idx" ON "artwork_analyses"("status", "created_at");

ALTER TABLE "artwork_analyses" ADD CONSTRAINT "artwork_analyses_artwork_id_fkey" FOREIGN KEY ("artwork_id") REFERENCES "user_artworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
