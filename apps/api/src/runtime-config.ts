const productionRequiredVariables = [
  "ADMIN_ACCOUNTS_JSON",
  "DATABASE_URL",
  "INTERNAL_WORKER_TOKEN",
  "JWT_SECRET",
  "PUBLIC_WEB_URL",
  "REDIS_URL",
  "S3_BUCKET_PRIVATE",
  "S3_BUCKET_PUBLIC",
  "S3_REGION",
  "WEB_CACHE_INVALIDATION_TOKEN",
  "WEB_CACHE_INVALIDATION_URL",
] as const;

const unsafeSecretFragments = ["change-me", "replace-with", "replace-"];

export function validateRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment.ARTWORK_DELETION_DELAY_SECONDS !== undefined) {
    const deletionDelay = Number(environment.ARTWORK_DELETION_DELAY_SECONDS);
    if (
      !Number.isFinite(deletionDelay) ||
      deletionDelay < 0 ||
      deletionDelay > 30 * 24 * 60 * 60
    ) {
      throw new Error(
        "ARTWORK_DELETION_DELAY_SECONDS must be between 0 and 2592000.",
      );
    }
  }
  if (environment.NODE_ENV !== "production") return;

  const missing = productionRequiredVariables.filter(
    (name) => !environment[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Production configuration is missing: ${missing.join(", ")}`,
    );
  }

  for (const name of [
    "PUBLIC_WEB_URL",
    "WEB_CACHE_INVALIDATION_URL",
  ] as const) {
    const parsed = new URL(environment[name]!);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`${name} must use http or https.`);
    }
  }

  for (const name of [
    "JWT_SECRET",
    "INTERNAL_WORKER_TOKEN",
    "WEB_CACHE_INVALIDATION_TOKEN",
  ] as const) {
    const value = environment[name] ?? "";
    if (
      value.length < 32 ||
      unsafeSecretFragments.some((fragment) => value.includes(fragment))
    ) {
      throw new Error(
        `${name} must be a non-placeholder secret of 32+ characters.`,
      );
    }
  }

  const accounts = environment.ADMIN_ACCOUNTS_JSON ?? "";
  if (unsafeSecretFragments.some((fragment) => accounts.includes(fragment))) {
    throw new Error(
      "ADMIN_ACCOUNTS_JSON still contains a placeholder credential.",
    );
  }
}
