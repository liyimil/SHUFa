-- CreateEnum
CREATE TYPE "ContentAuditAction" AS ENUM ('CREATE_CALLIGRAPHER', 'CREATE_WORK', 'CREATE_EDITION', 'CREATE_RIGHTS', 'CREATE_SOURCE_ASSET', 'CREATE_GLYPH', 'REVIEW_GLYPH', 'PUBLISH_GLYPH', 'UNPUBLISH_GLYPH');

-- CreateTable
CREATE TABLE "content_audits" (
    "id" UUID NOT NULL,
    "actor_key" VARCHAR(200) NOT NULL,
    "action" "ContentAuditAction" NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_audits_entity_type_entity_id_created_at_idx" ON "content_audits"("entity_type", "entity_id", "created_at");
CREATE INDEX "content_audits_actor_key_created_at_idx" ON "content_audits"("actor_key", "created_at");
