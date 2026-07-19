import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

export const PRACTICE_ANALYSIS_QUEUE = Symbol("PRACTICE_ANALYSIS_QUEUE");
export const practiceAnalysisQueueName = "practice-structure-v1";

export interface PracticeAnalysisJob {
  attemptId: string;
  masterObjectKey: string;
  userMimeType: string;
  userObjectKey: string;
}

export interface PracticeAnalysisQueue {
  enqueue(job: PracticeAnalysisJob): Promise<void>;
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
export class BullPracticeAnalysisQueue implements PracticeAnalysisQueue {
  private queue: Queue<PracticeAnalysisJob> | null = null;

  async enqueue(job: PracticeAnalysisJob): Promise<void> {
    this.queue ??= new Queue<PracticeAnalysisJob>(practiceAnalysisQueueName, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 4,
        backoff: { delay: 2_000, type: "exponential" },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
    await this.queue.add("structure-comparison", job, { jobId: job.attemptId });
  }
}
