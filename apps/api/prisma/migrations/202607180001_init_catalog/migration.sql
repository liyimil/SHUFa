-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScriptStyle" AS ENUM ('REGULAR');

-- CreateEnum
CREATE TYPE "CharacterVariantType" AS ENUM ('SIMPLIFIED', 'TRADITIONAL', 'HISTORICAL', 'COMPATIBILITY');

-- CreateEnum
CREATE TYPE "RightsStatus" AS ENUM ('UNKNOWN', 'INTERNAL_TEST_ONLY', 'CLEARED_PUBLIC', 'RESTRICTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuthenticityGrade" AS ENUM ('A_ORIGINAL', 'B_RUBBING_OR_AUTHORIZED_EDITION', 'C_MODERN_COPY', 'D_AI_GENERATED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('SOURCE_PAGE', 'GLYPH_CROP', 'THUMBNAIL', 'CONTEXT_CROP');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "value" VARCHAR(8) NOT NULL,
    "unicode_code_point" VARCHAR(32) NOT NULL,
    "radical" VARCHAR(8),
    "structure_type" VARCHAR(32),
    "frequency_rank" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_variants" (
    "id" UUID NOT NULL,
    "canonical_character_id" UUID NOT NULL,
    "value" VARCHAR(8) NOT NULL,
    "type" "CharacterVariantType" NOT NULL,

    CONSTRAINT "character_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calligraphers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "dynasty" VARCHAR(64) NOT NULL,
    "birth_year" INTEGER,
    "death_year" INTEGER,
    "biography" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calligraphers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "works" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "dynasty" VARCHAR(64) NOT NULL,
    "script_style" "ScriptStyle" NOT NULL,
    "calligrapher_id" UUID NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_editions" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "holding_institution" VARCHAR(200),
    "publication" VARCHAR(300),
    "source_url" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rights_records" (
    "id" UUID NOT NULL,
    "status" "RightsStatus" NOT NULL,
    "source_name" VARCHAR(200) NOT NULL,
    "source_url" VARCHAR(2000),
    "license_name" VARCHAR(200),
    "attribution_text" VARCHAR(1000),
    "allow_commercial" BOOLEAN NOT NULL DEFAULT false,
    "max_public_width" INTEGER,
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rights_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_assets" (
    "id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "rights_record_id" UUID NOT NULL,
    "object_key" VARCHAR(1000) NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "page_label" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glyphs" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "source_asset_id" UUID NOT NULL,
    "script_style" "ScriptStyle" NOT NULL,
    "content_status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "authenticity_grade" "AuthenticityGrade" NOT NULL,
    "bbox_x" INTEGER NOT NULL,
    "bbox_y" INTEGER NOT NULL,
    "bbox_width" INTEGER NOT NULL,
    "bbox_height" INTEGER NOT NULL,
    "image_quality" INTEGER NOT NULL DEFAULT 0,
    "beginner_weight" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "glyphs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glyph_assets" (
    "id" UUID NOT NULL,
    "glyph_id" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "object_key" VARCHAR(1000) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "glyph_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reviews" (
    "id" UUID NOT NULL,
    "glyph_id" UUID NOT NULL,
    "reviewer_key" VARCHAR(100) NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "characters_value_key" ON "characters"("value");
CREATE UNIQUE INDEX "characters_unicode_code_point_key" ON "characters"("unicode_code_point");
CREATE INDEX "character_variants_value_idx" ON "character_variants"("value");
CREATE UNIQUE INDEX "character_variants_canonical_character_id_value_type_key" ON "character_variants"("canonical_character_id", "value", "type");
CREATE UNIQUE INDEX "calligraphers_name_dynasty_key" ON "calligraphers"("name", "dynasty");
CREATE INDEX "works_script_style_idx" ON "works"("script_style");
CREATE UNIQUE INDEX "works_title_calligrapher_id_key" ON "works"("title", "calligrapher_id");
CREATE UNIQUE INDEX "work_editions_work_id_name_key" ON "work_editions"("work_id", "name");
CREATE INDEX "rights_records_status_idx" ON "rights_records"("status");
CREATE UNIQUE INDEX "source_assets_object_key_key" ON "source_assets"("object_key");
CREATE UNIQUE INDEX "source_assets_checksum_sha256_key" ON "source_assets"("checksum_sha256");
CREATE INDEX "source_assets_edition_id_idx" ON "source_assets"("edition_id");
CREATE INDEX "source_assets_rights_record_id_idx" ON "source_assets"("rights_record_id");
CREATE INDEX "glyphs_character_id_content_status_script_style_idx" ON "glyphs"("character_id", "content_status", "script_style");
CREATE INDEX "glyphs_source_asset_id_idx" ON "glyphs"("source_asset_id");
CREATE UNIQUE INDEX "glyphs_source_asset_id_bbox_x_bbox_y_bbox_width_bbox_height_key" ON "glyphs"("source_asset_id", "bbox_x", "bbox_y", "bbox_width", "bbox_height");
CREATE UNIQUE INDEX "glyph_assets_object_key_key" ON "glyph_assets"("object_key");
CREATE INDEX "glyph_assets_glyph_id_kind_idx" ON "glyph_assets"("glyph_id", "kind");
CREATE INDEX "content_reviews_glyph_id_created_at_idx" ON "content_reviews"("glyph_id", "created_at");

-- AddForeignKey
ALTER TABLE "character_variants" ADD CONSTRAINT "character_variants_canonical_character_id_fkey" FOREIGN KEY ("canonical_character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "works" ADD CONSTRAINT "works_calligrapher_id_fkey" FOREIGN KEY ("calligrapher_id") REFERENCES "calligraphers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_editions" ADD CONSTRAINT "work_editions_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_assets" ADD CONSTRAINT "source_assets_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "work_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_assets" ADD CONSTRAINT "source_assets_rights_record_id_fkey" FOREIGN KEY ("rights_record_id") REFERENCES "rights_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "glyphs" ADD CONSTRAINT "glyphs_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "glyphs" ADD CONSTRAINT "glyphs_source_asset_id_fkey" FOREIGN KEY ("source_asset_id") REFERENCES "source_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "glyph_assets" ADD CONSTRAINT "glyph_assets_glyph_id_fkey" FOREIGN KEY ("glyph_id") REFERENCES "glyphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_glyph_id_fkey" FOREIGN KEY ("glyph_id") REFERENCES "glyphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
