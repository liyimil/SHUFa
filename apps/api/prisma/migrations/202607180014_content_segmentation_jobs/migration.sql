CREATE TYPE "ContentSegmentationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "SegmentationCandidateStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

ALTER TYPE "ContentAuditAction" ADD VALUE 'CREATE_SEGMENTATION_JOB';
ALTER TYPE "ContentAuditAction" ADD VALUE 'COMPLETE_SEGMENTATION_JOB';
ALTER TYPE "ContentAuditAction" ADD VALUE 'FAIL_SEGMENTATION_JOB';

CREATE TABLE "content_segmentation_jobs" (
    "id" UUID NOT NULL,
    "source_asset_id" UUID NOT NULL,
    "active_key" VARCHAR(36),
    "status" "ContentSegmentationStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" VARCHAR(200) NOT NULL,
    "algorithm_version" VARCHAR(100),
    "failure_code" VARCHAR(100),
    "failure_message" VARCHAR(1000),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "content_segmentation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_segmentation_candidates" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "bbox_x" INTEGER NOT NULL,
    "bbox_y" INTEGER NOT NULL,
    "bbox_width" INTEGER NOT NULL,
    "bbox_height" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "status" "SegmentationCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_segmentation_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_segmentation_jobs_active_key_key" ON "content_segmentation_jobs"("active_key");
CREATE INDEX "content_segmentation_jobs_source_asset_id_created_at_idx" ON "content_segmentation_jobs"("source_asset_id", "created_at");
CREATE INDEX "content_segmentation_jobs_status_created_at_idx" ON "content_segmentation_jobs"("status", "created_at");
CREATE UNIQUE INDEX "content_segmentation_candidates_job_id_sort_order_key" ON "content_segmentation_candidates"("job_id", "sort_order");
CREATE INDEX "content_segmentation_candidates_job_id_status_idx" ON "content_segmentation_candidates"("job_id", "status");

ALTER TABLE "content_segmentation_jobs" ADD CONSTRAINT "content_segmentation_jobs_source_asset_id_fkey" FOREIGN KEY ("source_asset_id") REFERENCES "source_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_segmentation_candidates" ADD CONSTRAINT "content_segmentation_candidates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "content_segmentation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
