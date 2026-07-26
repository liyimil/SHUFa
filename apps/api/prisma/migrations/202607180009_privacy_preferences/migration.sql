CREATE TYPE "UserConsentDimension" AS ENUM ('STORAGE', 'PUBLIC_SHARING', 'MODEL_TRAINING');

CREATE TABLE "user_privacy_preferences" (
    "user_id" UUID NOT NULL,
    "allow_artwork_storage" BOOLEAN NOT NULL DEFAULT true,
    "allow_public_sharing" BOOLEAN NOT NULL DEFAULT false,
    "allow_model_training" BOOLEAN NOT NULL DEFAULT false,
    "policy_version" VARCHAR(50) NOT NULL,
    "storage_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharing_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "training_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_privacy_preferences_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "user_consent_audits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "dimension" "UserConsentDimension" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "policy_version" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_consent_audits_pkey" PRIMARY KEY ("id")
);

INSERT INTO "user_privacy_preferences" ("user_id", "policy_version")
SELECT "id", 'privacy-v1' FROM "users";

-- UNION resolves untyped string literals as text, so cast each branch to the
-- enum explicitly before inserting into the enum-typed dimension column.
INSERT INTO "user_consent_audits" ("id", "user_id", "dimension", "enabled", "policy_version")
SELECT gen_random_uuid(), "id", 'STORAGE'::"UserConsentDimension", true, 'privacy-v1' FROM "users"
UNION ALL
SELECT gen_random_uuid(), "id", 'PUBLIC_SHARING'::"UserConsentDimension", false, 'privacy-v1' FROM "users"
UNION ALL
SELECT gen_random_uuid(), "id", 'MODEL_TRAINING'::"UserConsentDimension", false, 'privacy-v1' FROM "users";

CREATE INDEX "user_consent_audits_user_id_dimension_created_at_idx" ON "user_consent_audits"("user_id", "dimension", "created_at");
ALTER TABLE "user_privacy_preferences" ADD CONSTRAINT "user_privacy_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_consent_audits" ADD CONSTRAINT "user_consent_audits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
