import { sanitizeDiagnosticMessage } from "@calligraphy/observability";

export const artworkAnalysisQueueName = "artwork-analysis-v1";

export interface ArtworkAnalysisJob {
  analysisId: string;
  artworkId: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  objectKey: string;
}

export interface AnalysisDependencies {
  aiServiceUrl: string;
  apiBaseUrl: string;
  downloadObject(objectKey: string): Promise<Uint8Array>;
  fetcher: typeof fetch;
  internalToken: string;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/$/, "");
}

async function readError(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "响应内容不可读";
  }
}

export async function processArtworkAnalysis(
  job: ArtworkAnalysisJob,
  dependencies: AnalysisDependencies,
): Promise<void> {
  const image = await dependencies.downloadObject(job.objectKey);
  if (image.byteLength === 0 || image.byteLength > 10 * 1024 * 1024) {
    throw new Error("Downloaded artwork has an invalid size.");
  }

  const form = new FormData();
  const imageCopy = Uint8Array.from(image);
  form.append(
    "file",
    new Blob([imageCopy.buffer], { type: job.mimeType }),
    "artwork",
  );
  const qualityResponse = await dependencies.fetcher(
    `${normalizeUrl(dependencies.aiServiceUrl)}/v1/image-quality`,
    { body: form, method: "POST" },
  );
  if (!qualityResponse.ok) {
    throw new Error(
      `AI quality analysis failed (${qualityResponse.status}): ${await readError(qualityResponse)}`,
    );
  }

  const result = (await qualityResponse.json()) as unknown;
  const callbackResponse = await dependencies.fetcher(
    `${normalizeUrl(dependencies.apiBaseUrl)}/api/v1/internal/analyses/${encodeURIComponent(job.analysisId)}/result`,
    {
      body: JSON.stringify(result),
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": dependencies.internalToken,
      },
      method: "POST",
    },
  );
  if (!callbackResponse.ok) {
    throw new Error(
      `Analysis callback failed (${callbackResponse.status}): ${await readError(callbackResponse)}`,
    );
  }
}

export async function reportArtworkAnalysisFailure(
  job: ArtworkAnalysisJob,
  dependencies: Pick<
    AnalysisDependencies,
    "apiBaseUrl" | "fetcher" | "internalToken"
  >,
  error: Error,
): Promise<void> {
  const callbackResponse = await dependencies.fetcher(
    `${normalizeUrl(dependencies.apiBaseUrl)}/api/v1/internal/analyses/${encodeURIComponent(job.analysisId)}/failure`,
    {
      body: JSON.stringify({
        failureCode: "QUALITY_ANALYSIS_FAILED",
        failureMessage: sanitizeDiagnosticMessage(error, 2_000),
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": dependencies.internalToken,
      },
      method: "POST",
    },
  );
  if (!callbackResponse.ok) {
    throw new Error(
      `Analysis failure callback failed (${callbackResponse.status}).`,
    );
  }
}
