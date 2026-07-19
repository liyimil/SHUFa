import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ObjectStorage } from "../src/upload/object-storage.js";
import type { InsightsRepository } from "../src/insights/insights.repository.js";
import { InsightsService } from "../src/insights/insights.service.js";
import type {
  AdviceSampleRecord,
  EventWriteResult,
  FunnelCount,
} from "../src/insights/insights.types.js";

const userId = "3fe537fd-6601-43f0-a31d-781bd5bde945";
const sessionId = "53a3e68c-c38c-4b79-90b4-ab1212491184";
const attemptId = "ebbc505b-7df5-4ce7-8f3a-33dc07c4a957";
const eventId = "4b02e7dd-24de-47e3-ab13-1d4a7f952935";
const now = new Date("2026-07-18T12:00:00.000Z");

const sample: AdviceSampleRecord = {
  advice: {
    suggestions: [
      { action: "略向左收", evidence: "重心偏右", phenomenon: "重心" },
    ],
    threshold_version: "structure-v1",
  },
  attemptCreatedAt: now,
  attemptId,
  character: "永",
  master: {
    calligrapherName: "欧阳询",
    imageObjectKey: "content/glyphs/master.webp",
    workTitle: "九成宫醴泉铭",
  },
  practiceSessionId: sessionId,
  review: null,
  sequence: 1,
  userImageObjectKey: "users/test/artwork.jpg",
};

class MemoryInsightsRepository implements InsightsRepository {
  eventResult: EventWriteResult = "CREATED";
  funnelCounts: FunnelCount[] = [];
  owned = true;
  savedReview: Parameters<InsightsRepository["saveAdviceReview"]>[0] | null =
    null;

  isOwnedPracticeSession() {
    return Promise.resolve(this.owned);
  }
  listAdviceSamples() {
    return Promise.resolve([sample]);
  }
  readFunnel() {
    return Promise.resolve(this.funnelCounts);
  }
  recordEvent() {
    return Promise.resolve(this.eventResult);
  }
  saveAdviceReview(
    input: Parameters<InsightsRepository["saveAdviceReview"]>[0],
  ) {
    this.savedReview = input;
    return Promise.resolve({
      ...sample,
      review: {
        comment: input.comment,
        reviewedAt: input.now,
        reviewerKey: input.actorKey,
        verdict: input.verdict,
      },
    });
  }
}

class MemoryStorage implements ObjectStorage {
  createDownloadUrl(input: { objectKey: string }) {
    return Promise.resolve(`https://private.example/${input.objectKey}`);
  }
  createUploadUrl() {
    return Promise.reject(new Error("not used"));
  }
  deletePrivateObject() {
    return Promise.reject(new Error("not used"));
  }
  deletePublicObject() {
    return Promise.reject(new Error("not used"));
  }
  headPrivateObject() {
    return Promise.reject(new Error("not used"));
  }
  readPrivateObject() {
    return Promise.reject(new Error("not used"));
  }
}

describe("InsightsService", () => {
  it("records a bounded, session-owned product event", async () => {
    const service = new InsightsService(
      new MemoryInsightsRepository(),
      new MemoryStorage(),
    );
    const result = await service.trackEvent(
      userId,
      {
        eventId,
        name: "PRACTICE_CREATED",
        occurredAt: now.toISOString(),
        practiceSessionId: sessionId,
      },
      now,
    );
    assert.equal(result.status, "RECORDED");
  });

  it("rejects a practice event linked to another user's session", async () => {
    const repository = new MemoryInsightsRepository();
    repository.owned = false;
    const service = new InsightsService(repository, new MemoryStorage());
    await assert.rejects(() =>
      service.trackEvent(
        userId,
        {
          eventId,
          name: "PRACTICE_COMPLETED",
          occurredAt: now.toISOString(),
          practiceSessionId: sessionId,
        },
        now,
      ),
    );
  });

  it("returns signed private samples and records a teacher opinion", async () => {
    const repository = new MemoryInsightsRepository();
    const service = new InsightsService(repository, new MemoryStorage());
    const samples = await service.listAdviceSamples({ status: "UNREVIEWED" });
    assert.equal(
      samples[0]?.userImageUrl,
      "https://private.example/users/test/artwork.jpg",
    );
    const result = await service.reviewAdvice(
      "teacher@example.com",
      attemptId,
      { comment: "证据与动作一致，可以保留。", verdict: "APPROVED" },
      now,
    );
    assert.equal(result.status, "REVIEWED");
    assert.equal(repository.savedReview?.actorKey, "teacher@example.com");
  });

  it("calculates the ordered closed-loop funnel for a bounded window", async () => {
    const repository = new MemoryInsightsRepository();
    repository.funnelCounts = [
      { count: 10, name: "ARTWORK_UPLOAD_COMPLETED" },
      { count: 4, name: "PRACTICE_COMPLETED" },
    ];
    const service = new InsightsService(repository, new MemoryStorage());
    const result = await service.funnel({}, now);
    assert.equal(result.completionRate, 0.4);
    assert.equal(result.stages[0]?.count, 10);
    assert.equal(result.stages.at(-1)?.count, 4);
  });
});
