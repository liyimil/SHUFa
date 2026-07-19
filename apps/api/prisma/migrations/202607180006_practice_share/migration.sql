CREATE TABLE "practice_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "selected_glyph_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "practice_attempts" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "artwork_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "advice_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practice_attempts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "favorite_glyphs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "glyph_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "favorite_glyphs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "share_links" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "practice_sessions_user_id_created_at_idx" ON "practice_sessions"("user_id", "created_at");
CREATE INDEX "practice_sessions_character_id_idx" ON "practice_sessions"("character_id");
CREATE UNIQUE INDEX "practice_attempts_artwork_id_key" ON "practice_attempts"("artwork_id");
CREATE UNIQUE INDEX "practice_attempts_session_id_sequence_key" ON "practice_attempts"("session_id", "sequence");
CREATE INDEX "practice_attempts_session_id_created_at_idx" ON "practice_attempts"("session_id", "created_at");
CREATE UNIQUE INDEX "favorite_glyphs_user_id_glyph_id_key" ON "favorite_glyphs"("user_id", "glyph_id");
CREATE INDEX "favorite_glyphs_user_id_created_at_idx" ON "favorite_glyphs"("user_id", "created_at");
CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");
CREATE INDEX "share_links_user_id_created_at_idx" ON "share_links"("user_id", "created_at");
CREATE INDEX "share_links_session_id_idx" ON "share_links"("session_id");
CREATE INDEX "share_links_expires_at_idx" ON "share_links"("expires_at");
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_selected_glyph_id_fkey" FOREIGN KEY ("selected_glyph_id") REFERENCES "glyphs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_artwork_id_fkey" FOREIGN KEY ("artwork_id") REFERENCES "user_artworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "favorite_glyphs" ADD CONSTRAINT "favorite_glyphs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorite_glyphs" ADD CONSTRAINT "favorite_glyphs_glyph_id_fkey" FOREIGN KEY ("glyph_id") REFERENCES "glyphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
