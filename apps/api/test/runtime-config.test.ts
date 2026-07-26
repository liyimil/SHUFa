import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateRuntimeConfiguration } from "../src/runtime-config.js";

const validProductionEnvironment: NodeJS.ProcessEnv = {
  ADMIN_ACCOUNTS_JSON:
    '[{"email":"admin@example.com","passwordHash":"scrypt$abc$def","roles":["ADMIN"]}]',
  CORS_ORIGINS: "https://calligraphy.example.com,https://admin.example.com",
  DATABASE_URL: "postgresql://service:secret@database/calligraphy",
  INTERNAL_WORKER_TOKEN: "worker-token-that-is-long-and-random-123456",
  JWT_SECRET: "jwt-token-that-is-long-and-random-123456789",
  NODE_ENV: "production",
  PHONE_HASH_PEPPER: "phone-hash-pepper-that-is-long-and-random-123456",
  PUBLIC_WEB_URL: "https://calligraphy.example.com",
  PUBLIC_ASSET_BASE_URL: "https://assets.example.com",
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

  it("requires a strong phone hash pepper in production", () => {
    assert.throws(
      () =>
        validateRuntimeConfiguration({
          ...validProductionEnvironment,
          PHONE_HASH_PEPPER: "short",
        }),
      /PHONE_HASH_PEPPER/,
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

  it("rejects a CORS value that is not an origin", () => {
    assert.throws(
      () =>
        validateRuntimeConfiguration({
          ...validProductionEnvironment,
          CORS_ORIGINS: "https://calligraphy.example.com/path",
        }),
      /CORS_ORIGINS/,
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

  it("accepts valid rate limit configuration", () => {
    assert.doesNotThrow(() =>
      validateRuntimeConfiguration({
        RATE_LIMIT_MAX: "200",
        RATE_LIMIT_TTL_MS: "30000",
      }),
    );
  });

  it("rejects a non-positive RATE_LIMIT_TTL_MS", () => {
    assert.throws(
      () =>
        validateRuntimeConfiguration({
          RATE_LIMIT_TTL_MS: "-1",
        }),
      /RATE_LIMIT_TTL_MS/,
    );
  });

  it("rejects a non-integer RATE_LIMIT_MAX", () => {
    assert.throws(
      () =>
        validateRuntimeConfiguration({
          RATE_LIMIT_MAX: "1.5",
        }),
      /RATE_LIMIT_MAX/,
    );
  });
});
