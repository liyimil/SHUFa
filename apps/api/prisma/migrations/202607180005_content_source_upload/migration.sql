CREATE TABLE "content_source_upload_sessions" (
    "id" UUID NOT NULL,
    "actor_key" VARCHAR(200) NOT NULL,
    "edition_id" UUID NOT NULL,
    "rights_record_id" UUID NOT NULL,
    "source_asset_id" UUID,
    "object_key" VARCHAR(1000) NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "page_label" VARCHAR(100),
    "size_bytes" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_source_upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_source_upload_sessions_source_asset_id_key" ON "content_source_upload_sessions"("source_asset_id");
CREATE UNIQUE INDEX "content_source_upload_sessions_object_key_key" ON "content_source_upload_sessions"("object_key");
CREATE INDEX "content_source_upload_sessions_actor_key_created_at_idx" ON "content_source_upload_sessions"("actor_key", "created_at");
CREATE INDEX "content_source_upload_sessions_expires_at_idx" ON "content_source_upload_sessions"("expires_at");

ALTER TABLE "content_source_upload_sessions" ADD CONSTRAINT "content_source_upload_sessions_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "work_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_source_upload_sessions" ADD CONSTRAINT "content_source_upload_sessions_rights_record_id_fkey" FOREIGN KEY ("rights_record_id") REFERENCES "rights_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_source_upload_sessions" ADD CONSTRAINT "content_source_upload_sessions_source_asset_id_fkey" FOREIGN KEY ("source_asset_id") REFERENCES "source_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
