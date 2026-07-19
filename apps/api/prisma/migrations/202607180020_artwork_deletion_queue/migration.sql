CREATE TYPE "ArtworkDeletionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE "artwork_deletion_tasks" (
  "id" UUID NOT NULL,
  "artwork_id" UUID NOT NULL,
  "object_key" VARCHAR(1000) NOT NULL,
  "status" "ArtworkDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_number" INTEGER NOT NULL DEFAULT 1,
  "failure_code" VARCHAR(100),
  "failure_message" VARCHAR(2000),
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "artwork_deletion_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artwork_deletion_tasks_artwork_id_key"
ON "artwork_deletion_tasks"("artwork_id");

CREATE INDEX "artwork_deletion_tasks_status_requested_at_idx"
ON "artwork_deletion_tasks"("status", "requested_at");

ALTER TABLE "artwork_deletion_tasks"
ADD CONSTRAINT "artwork_deletion_tasks_artwork_id_fkey"
FOREIGN KEY ("artwork_id") REFERENCES "user_artworks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
