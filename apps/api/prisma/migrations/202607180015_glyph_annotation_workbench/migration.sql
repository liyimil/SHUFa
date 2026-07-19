ALTER TYPE "ContentAuditAction" ADD VALUE 'ACCEPT_SEGMENTATION_CANDIDATE';
ALTER TYPE "ContentAuditAction" ADD VALUE 'REJECT_SEGMENTATION_CANDIDATE';

ALTER TABLE "glyphs"
ADD COLUMN "observed_character" VARCHAR(8),
ADD COLUMN "label_candidates" JSONB,
ADD COLUMN "transcription" TEXT,
ADD COLUMN "annotated_by" VARCHAR(200);

ALTER TABLE "content_segmentation_candidates"
ADD COLUMN "glyph_id" UUID,
ADD COLUMN "annotated_by" VARCHAR(200),
ADD COLUMN "annotated_at" TIMESTAMPTZ(6),
ADD COLUMN "rejection_note" VARCHAR(1000);

CREATE UNIQUE INDEX "content_segmentation_candidates_glyph_id_key"
ON "content_segmentation_candidates"("glyph_id");

ALTER TABLE "content_segmentation_candidates"
ADD CONSTRAINT "content_segmentation_candidates_glyph_id_fkey"
FOREIGN KEY ("glyph_id") REFERENCES "glyphs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
