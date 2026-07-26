import { createHash } from "node:crypto";

import { sanitizeDiagnosticMessage } from "@calligraphy/observability";

export const practiceAnalysisQueueName = "practice-structure-v1";

export interface PracticeAnalysisJob {
  attemptId: string;
  masterObjectKey: string;
  userMimeType: string;
  userObjectKey: string;
}

export interface PracticeAnalysisDependencies {
  aiServiceUrl: string;
  apiBaseUrl: string;
  downloadMaster(objectKey: string): Promise<Uint8Array>;
  downloadUser(objectKey: string): Promise<Uint8Array>;
  fetcher: typeof fetch;
  internalToken: string;
}

function normalize(value: string): string {
  return value.replace(/\/$/, "");
}

export async function processPracticeAnalysis(
  job: PracticeAnalysisJob,
  dependencies: PracticeAnalysisDependencies,
): Promise<void> {
  const [userBytes, masterBytes] = await Promise.all([
    dependencies.downloadUser(job.userObjectKey),
    dependencies.downloadMaster(job.masterObjectKey),
  ]);
  const user = Uint8Array.from(userBytes);
  const master = Uint8Array.from(masterBytes);
  const form = new FormData();
  form.append(
    "user_file",
    new Blob([user.buffer], { type: job.userMimeType }),
    "user-artwork",
  );
  form.append(
    "master_file",
    new Blob([master.buffer], { type: "image/webp" }),
    "master-glyph",
  );
  const comparison = await dependencies.fetcher(
    `${normalize(dependencies.aiServiceUrl)}/v1/structure-comparison`,
    {
      body: form,
      headers: { "X-Request-Id": job.attemptId },
      method: "POST",
    },
  );
  if (!comparison.ok) {
    throw new Error(`Structure comparison failed (${comparison.status}).`);
  }
  const result = (await comparison.json()) as Record<string, unknown>;
  const callback = await dependencies.fetcher(
    `${normalize(dependencies.apiBaseUrl)}/api/v1/internal/practice-attempts/${encodeURIComponent(job.attemptId)}/advice`,
    {
      body: JSON.stringify({
        provenance: {
          masterChecksumSha256: createHash("sha256")
            .update(master)
            .digest("hex"),
          masterObjectKey: job.masterObjectKey,
          measurementVersion: result.measurement_version,
          modelVersion: result.model_version,
          normalizationVersion: result.normalization_version,
          ruleVersion: result.threshold_version,
          userChecksumSha256: createHash("sha256").update(user).digest("hex"),
          userObjectKey: job.userObjectKey,
        },
        result,
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": dependencies.internalToken,
        "X-Request-Id": job.attemptId,
      },
      method: "POST",
    },
  );
  if (!callback.ok) {
    throw new Error(`Structure advice callback failed (${callback.status}).`);
  }
}

export async function reportPracticeAnalysisFailure(
  job: PracticeAnalysisJob,
  dependencies: Pick<
    PracticeAnalysisDependencies,
    "apiBaseUrl" | "fetcher" | "internalToken"
  >,
  error: Error,
): Promise<void> {
  const callback = await dependencies.fetcher(
    `${normalize(dependencies.apiBaseUrl)}/api/v1/internal/practice-attempts/${encodeURIComponent(job.attemptId)}/advice/failure`,
    {
      body: JSON.stringify({
        failureCode: "STRUCTURE_ANALYSIS_FAILED",
        failureMessage: sanitizeDiagnosticMessage(error, 2_000),
        masterObjectKey: job.masterObjectKey,
        userObjectKey: job.userObjectKey,
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": dependencies.internalToken,
        "X-Request-Id": job.attemptId,
      },
      method: "POST",
    },
  );
  if (!callback.ok) {
    throw new Error(`Structure failure callback failed (${callback.status}).`);
  }
}
