import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

export const ARTWORK_DELETION_QUEUE = Symbol("ARTWORK_DELETION_QUEUE");
export const artworkDeletionQueueName = "artwork-deletion-v1";

export interface ArtworkDeletionJob {
  artworkId: string;
  attemptNumber: number;
  deletionId: string;
  objectKey: string;
}

export interface ArtworkDeletionQueue {
  enqueue(job: ArtworkDeletionJob): Promise<void>;
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

function deletionDelayMilliseconds(): number {
  const seconds = Number(process.env.ARTWORK_DELETION_DELAY_SECONDS ?? "0");
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30 * 24 * 60 * 60) {
    throw new Error(
      "ARTWORK_DELETION_DELAY_SECONDS must be between 0 and 2592000.",
    );
  }
  return Math.round(seconds * 1_000);
}

@Injectable()
export class BullArtworkDeletionQueue implements ArtworkDeletionQueue {
  private queue: Queue<ArtworkDeletionJob> | null = null;

  async enqueue(job: ArtworkDeletionJob): Promise<void> {
    this.queue ??= new Queue<ArtworkDeletionJob>(artworkDeletionQueueName, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { delay: 2_000, type: "exponential" },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
    await this.queue.add("delete-private-artwork", job, {
      delay: deletionDelayMilliseconds(),
      jobId: `${job.deletionId}-${job.attemptNumber}`,
    });
  }
}
