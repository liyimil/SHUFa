CREATE TABLE "favorite_groups" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" VARCHAR(40) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "favorite_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "favorite_glyphs"
ADD COLUMN "group_id" UUID,
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "favorite_groups_user_id_name_key"
ON "favorite_groups"("user_id", "name");

CREATE INDEX "favorite_groups_user_id_sort_order_idx"
ON "favorite_groups"("user_id", "sort_order");

CREATE INDEX "favorite_glyphs_user_id_group_id_sort_order_idx"
ON "favorite_glyphs"("user_id", "group_id", "sort_order");

ALTER TABLE "favorite_groups"
ADD CONSTRAINT "favorite_groups_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_glyphs"
ADD CONSTRAINT "favorite_glyphs_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "favorite_groups"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
