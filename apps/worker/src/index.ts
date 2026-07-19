import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { sanitizeDiagnosticMessage } from "@calligraphy/observability";
import { Worker } from "bullmq";

import {
  artworkDeletionQueueName,
  type ArtworkDeletionJob,
  processArtworkDeletion,
  reportArtworkDeletionFailure,
} from "./deletion.js";
import {
  artworkAnalysisQueueName,
  type ArtworkAnalysisJob,
  processArtworkAnalysis,
  reportArtworkAnalysisFailure,
} from "./analysis.js";
import {
  glyphCropQueueName,
  type GlyphCropJob,
  processGlyphCrop,
} from "./content.js";
import {
  practiceAnalysisQueueName,
  type PracticeAnalysisJob,
  processPracticeAnalysis,
  reportPracticeAnalysisFailure,
} from "./practice.js";
import {
  processSourceSegmentation,
  reportSourceSegmentationFailure,
  sourceSegmentationQueueName,
  type SourceSegmentationJob,
} from "./segmentation.js";

export interface WorkerStatus {
  service: "worker";
  status: "idle";
}

export function getWorkerStatus(): WorkerStatus {
  return { service: "worker", status: "idle" };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to start the analysis worker.`);
  }
  return value;
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    host: url.hostname,
    password: url.password || undefined,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
  };
}

export function startWorker(): Worker<ArtworkAnalysisJob> {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET_PRIVATE ?? "calligraphy-private";
  const publicBucket = process.env.S3_BUCKET_PUBLIC ?? "calligraphy-public";
  const s3 = new S3Client({
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    region: process.env.S3_REGION ?? "local",
  });
  const dependencies = {
    aiServiceUrl: requiredEnvironment("AI_SERVICE_URL"),
    apiBaseUrl: requiredEnvironment("API_BASE_URL"),
    async downloadObject(objectKey: string): Promise<Uint8Array> {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      if (!response.Body) {
        throw new Error("Artwork object has no response body.");
      }
      return response.Body.transformToByteArray();
    },
    fetcher: fetch,
    internalToken: requiredEnvironment("INTERNAL_WORKER_TOKEN"),
  };

  const worker = new Worker<ArtworkAnalysisJob>(
    artworkAnalysisQueueName,
    (job) => processArtworkAnalysis(job.data, dependencies),
    { connection: redisConnection(), concurrency: 2 },
  );
  worker.on("completed", (job) => {
    console.log(
      JSON.stringify({
        analysisId: job.data.analysisId,
        event: "artwork_analysis_completed",
        jobId: job.id,
      }),
    );
  });
  worker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        analysisId: job?.data.analysisId,
        error: sanitizeDiagnosticMessage(error),
        event: "artwork_analysis_failed",
        jobId: job?.id,
      }),
    );
    const attempts = Number(job?.opts.attempts ?? 1);
    if (job && job.attemptsMade >= attempts) {
      void reportArtworkAnalysisFailure(job.data, dependencies, error).catch(
        (callbackError: unknown) => {
          console.error(
            JSON.stringify({
              analysisId: job.data.analysisId,
              error: sanitizeDiagnosticMessage(callbackError),
              event: "artwork_analysis_failure_callback_failed",
            }),
          );
        },
      );
    }
  });

  const contentWorker = new Worker<GlyphCropJob>(
    glyphCropQueueName,
    (job) =>
      processGlyphCrop(job.data, {
        ...dependencies,
        async uploadPublicObject(input) {
          await s3.send(
            new PutObjectCommand({
              Body: input.body,
              Bucket: publicBucket,
              CacheControl: "public, max-age=31536000, immutable",
              ContentType: "image/webp",
              Key: input.objectKey,
              Metadata: { sha256: input.checksum },
            }),
          );
        },
      }),
    { connection: redisConnection(), concurrency: 2 },
  );
  contentWorker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        error: sanitizeDiagnosticMessage(error),
        event: "glyph_crop_failed",
        glyphId: job?.data.glyphId,
        jobId: job?.id,
      }),
    );
  });
  const segmentationWorker = new Worker<SourceSegmentationJob>(
    sourceSegmentationQueueName,
    (job) => processSourceSegmentation(job.data, dependencies),
    { connection: redisConnection(), concurrency: 1 },
  );
  segmentationWorker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        error: sanitizeDiagnosticMessage(error),
        event: "source_segmentation_failed",
        jobId: job?.id,
        segmentationJobId: job?.data.jobId,
      }),
    );
    const attempts = Number(job?.opts.attempts ?? 1);
    if (job && job.attemptsMade >= attempts) {
      void reportSourceSegmentationFailure(job.data, dependencies, error).catch(
        (callbackError: unknown) => {
          console.error(
            JSON.stringify({
              error: sanitizeDiagnosticMessage(callbackError),
              event: "source_segmentation_failure_callback_failed",
              segmentationJobId: job.data.jobId,
            }),
          );
        },
      );
    }
  });
  const practiceWorker = new Worker<PracticeAnalysisJob>(
    practiceAnalysisQueueName,
    (job) =>
      processPracticeAnalysis(job.data, {
        aiServiceUrl: dependencies.aiServiceUrl,
        apiBaseUrl: dependencies.apiBaseUrl,
        async downloadMaster(objectKey) {
          const response = await s3.send(
            new GetObjectCommand({ Bucket: publicBucket, Key: objectKey }),
          );
          if (!response.Body)
            throw new Error("Master glyph has no response body.");
          return response.Body.transformToByteArray();
        },
        downloadUser: dependencies.downloadObject,
        fetcher: dependencies.fetcher,
        internalToken: dependencies.internalToken,
      }),
    { connection: redisConnection(), concurrency: 2 },
  );
  practiceWorker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        attemptId: job?.data.attemptId,
        error: sanitizeDiagnosticMessage(error),
        event: "practice_analysis_failed",
        jobId: job?.id,
      }),
    );
    const attempts = Number(job?.opts.attempts ?? 1);
    if (job && job.attemptsMade >= attempts) {
      void reportPracticeAnalysisFailure(job.data, dependencies, error).catch(
        (callbackError: unknown) => {
          console.error(
            JSON.stringify({
              attemptId: job.data.attemptId,
              error: sanitizeDiagnosticMessage(callbackError),
              event: "practice_analysis_failure_callback_failed",
            }),
          );
        },
      );
    }
  });
  const deletionWorker = new Worker<ArtworkDeletionJob>(
    artworkDeletionQueueName,
    (job) =>
      processArtworkDeletion(job.data, {
        apiBaseUrl: dependencies.apiBaseUrl,
        async deletePrivateObject(objectKey) {
          await s3.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
          );
        },
        fetcher: dependencies.fetcher,
        internalToken: dependencies.internalToken,
      }),
    { connection: redisConnection(), concurrency: 2 },
  );
  deletionWorker.on("completed", (job) => {
    console.log(
      JSON.stringify({
        artworkId: job.data.artworkId,
        deletionId: job.data.deletionId,
        event: "artwork_deletion_completed",
        jobId: job.id,
      }),
    );
  });
  deletionWorker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        artworkId: job?.data.artworkId,
        deletionId: job?.data.deletionId,
        error: sanitizeDiagnosticMessage(error),
        event: "artwork_deletion_failed",
        jobId: job?.id,
      }),
    );
    const attempts = Number(job?.opts.attempts ?? 1);
    if (job && job.attemptsMade >= attempts) {
      void reportArtworkDeletionFailure(job.data, dependencies, error).catch(
        (callbackError: unknown) => {
          console.error(
            JSON.stringify({
              deletionId: job.data.deletionId,
              error: sanitizeDiagnosticMessage(callbackError),
              event: "artwork_deletion_failure_callback_failed",
            }),
          );
        },
      );
    }
  });
  return worker;
}

const invokedFile = process.argv[1] ?? "";

if (invokedFile.endsWith("index.ts") || invokedFile.endsWith("index.js")) {
  startWorker();
}
