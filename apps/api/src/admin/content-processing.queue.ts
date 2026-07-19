import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

export const CONTENT_PROCESSING_QUEUE = Symbol("CONTENT_PROCESSING_QUEUE");
export const glyphCropQueueName = "content-glyph-crop-v1";
export const sourceSegmentationQueueName = "content-source-segmentation-v1";

export interface GlyphCropJob {
  bboxHeight: number;
  bboxWidth: number;
  bboxX: number;
  bboxY: number;
  glyphId: string;
  mimeType: string;
  outputObjectKey: string;
  sourceObjectKey: string;
}

export interface SourceSegmentationJob {
  jobId: string;
  mimeType: string;
  sourceObjectKey: string;
}

export interface ContentProcessingQueue {
  enqueueGlyphCrop(job: GlyphCropJob): Promise<void>;
  enqueueSourceSegmentation(job: SourceSegmentationJob): Promise<void>;
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
export class BullContentProcessingQueue implements ContentProcessingQueue {
  private queue: Queue<GlyphCropJob> | null = null;
  private segmentationQueue: Queue<SourceSegmentationJob> | null = null;

  async enqueueGlyphCrop(job: GlyphCropJob): Promise<void> {
    this.queue ??= new Queue<GlyphCropJob>(glyphCropQueueName, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 4,
        backoff: { delay: 2_000, type: "exponential" },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
    await this.queue.add("glyph-crop", job, { jobId: job.glyphId });
  }

  async enqueueSourceSegmentation(job: SourceSegmentationJob): Promise<void> {
    this.segmentationQueue ??= new Queue<SourceSegmentationJob>(
      sourceSegmentationQueueName,
      {
        connection: redisConnection(),
        defaultJobOptions: {
          attempts: 4,
          backoff: { delay: 2_000, type: "exponential" },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      },
    );
    await this.segmentationQueue.add("source-segmentation", job, {
      jobId: job.jobId,
    });
  }
}
