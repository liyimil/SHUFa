-- Add explicit lifecycle state to content master data.
ALTER TABLE "calligraphers"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "works"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "work_editions"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Extend the immutable audit vocabulary for master-data revisions.
ALTER TYPE "ContentAuditAction" ADD VALUE 'UPDATE_CALLIGRAPHER';
ALTER TYPE "ContentAuditAction" ADD VALUE 'UPDATE_WORK';
ALTER TYPE "ContentAuditAction" ADD VALUE 'UPDATE_EDITION';
ALTER TYPE "ContentAuditAction" ADD VALUE 'UPDATE_RIGHTS';
