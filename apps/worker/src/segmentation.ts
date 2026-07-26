import { sanitizeDiagnosticMessage } from "@calligraphy/observability";

export const sourceSegmentationQueueName = "content-source-segmentation-v1";

export interface SourceSegmentationJob {
  jobId: string;
  mimeType: string;
  sourceObjectKey: string;
}

export interface SourceSegmentationDependencies {
  aiServiceUrl: string;
  apiBaseUrl: string;
  downloadObject(objectKey: string): Promise<Uint8Array>;
  fetcher: typeof fetch;
  internalToken: string;
}

function normalized(value: string): string {
  return value.replace(/\/$/, "");
}

function internalHeaders(
  token: string,
  requestId: string,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Internal-Token": token,
    "X-Request-Id": requestId,
  };
}

export async function processSourceSegmentation(
  job: SourceSegmentationJob,
  dependencies: SourceSegmentationDependencies,
): Promise<void> {
  const apiBaseUrl = normalized(dependencies.apiBaseUrl);
  const started = await dependencies.fetcher(
    `${apiBaseUrl}/api/v1/internal/content/segmentation-jobs/${encodeURIComponent(job.jobId)}/started`,
    {
      headers: internalHeaders(dependencies.internalToken, job.jobId),
      method: "POST",
    },
  );
  if (!started.ok) {
    throw new Error(`Segmentation start callback failed (${started.status}).`);
  }

  const source = Uint8Array.from(
    await dependencies.downloadObject(job.sourceObjectKey),
  );
  const form = new FormData();
  form.append(
    "file",
    new Blob([source.buffer], { type: job.mimeType }),
    "source",
  );
  const segmentation = await dependencies.fetcher(
    `${normalized(dependencies.aiServiceUrl)}/v1/source-segmentation`,
    {
      body: form,
      headers: { "X-Request-Id": job.jobId },
      method: "POST",
    },
  );
  if (!segmentation.ok) {
    throw new Error(`Source segmentation failed (${segmentation.status}).`);
  }
  const body = (await segmentation.json()) as {
    algorithmVersion?: unknown;
    candidates?: unknown;
  };
  if (
    typeof body.algorithmVersion !== "string" ||
    body.algorithmVersion.length === 0 ||
    body.algorithmVersion.length > 100 ||
    !Array.isArray(body.candidates) ||
    body.candidates.length > 500
  ) {
    throw new Error("Source segmentation response is invalid.");
  }

  const callback = await dependencies.fetcher(
    `${apiBaseUrl}/api/v1/internal/content/segmentation-jobs/${encodeURIComponent(job.jobId)}/result`,
    {
      body: JSON.stringify({
        algorithmVersion: body.algorithmVersion,
        candidates: body.candidates,
      }),
      headers: internalHeaders(dependencies.internalToken, job.jobId),
      method: "POST",
    },
  );
  if (!callback.ok) {
    throw new Error(
      `Segmentation result callback failed (${callback.status}).`,
    );
  }
}

export async function reportSourceSegmentationFailure(
  job: SourceSegmentationJob,
  dependencies: SourceSegmentationDependencies,
  error: Error,
): Promise<void> {
  const callback = await dependencies.fetcher(
    `${normalized(dependencies.apiBaseUrl)}/api/v1/internal/content/segmentation-jobs/${encodeURIComponent(job.jobId)}/failure`,
    {
      body: JSON.stringify({
        failureCode: "SEGMENTATION_WORKER_FAILED",
        failureMessage: sanitizeDiagnosticMessage(error, 1_000),
      }),
      headers: internalHeaders(dependencies.internalToken, job.jobId),
      method: "POST",
    },
  );
  if (!callback.ok) {
    throw new Error(
      `Segmentation failure callback failed (${callback.status}).`,
    );
  }
}
