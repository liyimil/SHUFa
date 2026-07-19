CREATE TYPE "ContentImportBatchStatus" AS ENUM ('INVALID', 'READY', 'COMMITTED');

ALTER TYPE "ContentAuditAction" ADD VALUE 'CREATE_IMPORT_BATCH';
ALTER TYPE "ContentAuditAction" ADD VALUE 'COMMIT_IMPORT_BATCH';

CREATE TABLE "content_import_batches" (
    "id" UUID NOT NULL,
    "actor_key" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "status" "ContentImportBatchStatus" NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "invalid_rows" INTEGER NOT NULL,
    "committed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_import_rows" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "target_glyph_id" UUID,
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB,
    "validation_errors" JSONB NOT NULL,
    CONSTRAINT "content_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_import_batches_actor_key_created_at_idx" ON "content_import_batches"("actor_key", "created_at");
CREATE INDEX "content_import_batches_status_created_at_idx" ON "content_import_batches"("status", "created_at");
CREATE INDEX "content_import_batches_checksum_sha256_idx" ON "content_import_batches"("checksum_sha256");
CREATE UNIQUE INDEX "content_import_rows_target_glyph_id_key" ON "content_import_rows"("target_glyph_id");
CREATE UNIQUE INDEX "content_import_rows_batch_id_row_number_key" ON "content_import_rows"("batch_id", "row_number");
CREATE INDEX "content_import_rows_batch_id_idx" ON "content_import_rows"("batch_id");

ALTER TABLE "content_import_rows"
ADD CONSTRAINT "content_import_rows_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "content_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
