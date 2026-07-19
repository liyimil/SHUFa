-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'DELETION_PENDING');

-- CreateEnum
CREATE TYPE "ArtworkStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETION_PENDING', 'DELETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone_hash" CHAR(64),
    "display_name" VARCHAR(100),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_artworks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "confirmed_character_id" UUID,
    "original_object_key" VARCHAR(1000) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "status" "ArtworkStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "failure_code" VARCHAR(100),
    "uploaded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_artworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "artwork_id" UUID NOT NULL,
    "object_key" VARCHAR(1000) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_hash_key" ON "users"("phone_hash");
CREATE UNIQUE INDEX "user_artworks_original_object_key_key" ON "user_artworks"("original_object_key");
CREATE INDEX "user_artworks_user_id_created_at_idx" ON "user_artworks"("user_id", "created_at");
CREATE INDEX "user_artworks_confirmed_character_id_idx" ON "user_artworks"("confirmed_character_id");
CREATE INDEX "user_artworks_status_idx" ON "user_artworks"("status");
CREATE UNIQUE INDEX "upload_sessions_artwork_id_key" ON "upload_sessions"("artwork_id");
CREATE UNIQUE INDEX "upload_sessions_object_key_key" ON "upload_sessions"("object_key");
CREATE INDEX "upload_sessions_expires_at_idx" ON "upload_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "user_artworks" ADD CONSTRAINT "user_artworks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_artworks" ADD CONSTRAINT "user_artworks_confirmed_character_id_fkey" FOREIGN KEY ("confirmed_character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_artwork_id_fkey" FOREIGN KEY ("artwork_id") REFERENCES "user_artworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
