ALTER TABLE "upload_sessions"
ADD COLUMN "client_request_id" VARCHAR(100);

UPDATE "upload_sessions"
SET "client_request_id" = "id"::text
WHERE "client_request_id" IS NULL;

ALTER TABLE "upload_sessions"
ALTER COLUMN "client_request_id" SET NOT NULL;

CREATE UNIQUE INDEX "upload_sessions_client_request_id_key"
ON "upload_sessions"("client_request_id");
