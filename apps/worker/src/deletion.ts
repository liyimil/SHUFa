import { sanitizeDiagnosticMessage } from "@calligraphy/observability";

export const artworkDeletionQueueName = "artwork-deletion-v1";

export interface ArtworkDeletionJob {
  artworkId: string;
  attemptNumber: number;
  deletionId: string;
  objectKey: string;
}

export interface ArtworkDeletionDependencies {
  apiBaseUrl: string;
  deletePrivateObject(objectKey: string): Promise<void>;
  fetcher: typeof fetch;
  internalToken: string;
}

function normalize(value: string): string {
  return value.replace(/\/$/, "");
}

export async function processArtworkDeletion(
  job: ArtworkDeletionJob,
  dependencies: ArtworkDeletionDependencies,
): Promise<void> {
  await dependencies.deletePrivateObject(job.objectKey);
  const callback = await dependencies.fetcher(
    `${normalize(dependencies.apiBaseUrl)}/api/v1/internal/artwork-deletions/${encodeURIComponent(job.deletionId)}/complete`,
    {
      body: JSON.stringify({
        attemptNumber: job.attemptNumber,
        objectKey: job.objectKey,
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": dependencies.internalToken,
        "X-Request-Id": job.deletionId,
      },
      method: "POST",
    },
  );
  if (!callback.ok) {
    throw new Error(`Artwork deletion callback failed (${callback.status}).`);
  }
}

export async function reportArtworkDeletionFailure(
  job: ArtworkDeletionJob,
  dependencies: Pick<
    ArtworkDeletionDependencies,
    "apiBaseUrl" | "fetcher" | "internalToken"
  >,
  error: Error,
): Promise<void> {
  const callback = await dependencies.fetcher(
    `${normalize(dependencies.apiBaseUrl)}/api/v1/internal/artwork-deletions/${encodeURIComponent(job.deletionId)}/failure`,
    {
      body: JSON.stringify({
        attemptNumber: job.attemptNumber,
        failureCode: "ARTWORK_PHYSICAL_DELETION_FAILED",
        failureMessage: sanitizeDiagnosticMessage(error, 2_000),
        objectKey: job.objectKey,
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": dependencies.internalToken,
        "X-Request-Id": job.deletionId,
      },
      method: "POST",
    },
  );
  if (!callback.ok) {
    throw new Error(
      `Artwork deletion failure callback failed (${callback.status}).`,
    );
  }
}
