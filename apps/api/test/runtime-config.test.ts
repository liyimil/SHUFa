import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateRuntimeConfiguration } from "../src/runtime-config.js";

const validProductionEnvironment: NodeJS.ProcessEnv = {
  ADMIN_ACCOUNTS_JSON:
    '[{"email":"admin@example.com","passwordHash":"scrypt$abc$def","roles":["ADMIN"]}]',
  DATABASE_URL: "postgresql://service:secret@database/calligraphy",
  INTERNAL_WORKER_TOKEN: "worker-token-that-is-long-and-random-123456",
  JWT_SECRET: "jwt-token-that-is-long-and-random-123456789",
  NODE_ENV: "production",
  PUBLIC_WEB_URL: "https://calligraphy.example.com",
  REDIS_URL: "redis://redis:6379",
  S3_BUCKET_PRIVATE: "private",
  S3_BUCKET_PUBLIC: "public",
  S3_REGION: "cn-east-1",
  WEB_CACHE_INVALIDATION_TOKEN:
    "catalog-cache-token-that-is-long-and-random-123456",
  WEB_CACHE_INVALIDATION_URL: "https://web.internal/api/internal/catalog-cache",
};

describe("runtime configuration", () => {
  it("accepts an explicit production configuration", () => {
    assert.doesNotThrow(() =>
      validateRuntimeConfiguration(validProductionEnvironment),
    );
  });

  it("fails fast when production configuration is missing", () => {
    assert.throws(
      () => validateRuntimeConfiguration({ NODE_ENV: "production" }),
      /Production configuration is missing/,
    );
  });

  it("rejects placeholder production secrets", () => {
    assert.throws(
      () =>
        validateRuntimeConfiguration({
          ...validProductionEnvironment,
          JWT_SECRET: "replace-with-at-least-32-random-characters",
        }),
      /JWT_SECRET/,
    );
  });

  it("rejects a non-http public Web origin", () => {
    assert.throws(
      () =>
        validateRuntimeConfiguration({
          ...validProductionEnvironment,
          PUBLIC_WEB_URL: "file:///tmp/share",
        }),
      /PUBLIC_WEB_URL/,
    );
  });

  it("rejects an invalid artwork deletion delay before startup", () => {
    assert.throws(
      () =>
        validateRuntimeConfiguration({
          ARTWORK_DELETION_DELAY_SECONDS: "not-a-number",
        }),
      /ARTWORK_DELETION_DELAY_SECONDS/,
    );
  });
});
