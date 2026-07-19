import { Queue } from "bullmq";
import { Injectable } from "@nestjs/common";

import type { ArtworkMimeType } from "../upload/upload.types.js";

export const ANALYSIS_QUEUE = Symbol("ANALYSIS_QUEUE");
export const artworkAnalysisQueueName = "artwork-analysis-v1";

export interface ArtworkAnalysisJob {
  analysisId: string;
  artworkId: string;
  mimeType: ArtworkMimeType;
  objectKey: string;
}

export interface ArtworkAnalysisQueue {
  enqueue(job: ArtworkAnalysisJob): Promise<void>;
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

@Injectable()
export class BullArtworkAnalysisQueue implements ArtworkAnalysisQueue {
  private queue: Queue<ArtworkAnalysisJob> | null = null;

  async enqueue(job: ArtworkAnalysisJob): Promise<void> {
    this.queue ??= new Queue<ArtworkAnalysisJob>(artworkAnalysisQueueName, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 4,
        backoff: { delay: 2_000, type: "exponential" },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
    await this.queue.add("image-quality", job, { jobId: job.analysisId });
  }
}
