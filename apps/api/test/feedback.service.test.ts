import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException } from "@nestjs/common";

import type { FeedbackRepository } from "../src/feedback/feedback.repository.js";
import { FeedbackService } from "../src/feedback/feedback.service.js";
import type {
  FeedbackAdminUpdate,
  FeedbackTicket,
  UserFeedbackTicket,
} from "../src/feedback/feedback.types.js";

const ticket: FeedbackTicket = {
  accurate: null,
  assignedTo: null,
  createdAt: new Date("2026-07-18T00:00:00.000Z"),
  id: "53a3e68c-c38c-4b79-90b4-ab1212491184",
  kind: "CONTENT_ERROR",
  message: "出处有误",
  referenceId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
  referenceType: "Glyph",
  resolutionNote: null,
  resolvedAt: null,
  status: "OPEN",
  updatedAt: new Date("2026-07-18T00:00:00.000Z"),
};

class MemoryFeedbackRepository implements FeedbackRepository {
  input: Parameters<FeedbackRepository["create"]>[0] | null = null;
  referenceValid = true;
  update: FeedbackAdminUpdate | null = null;
  create(input: Parameters<FeedbackRepository["create"]>[0]) {
    this.input = input;
    return Promise.resolve({ id: "feedback-id", status: "OPEN" as const });
  }
  isValidReference() {
    return Promise.resolve(this.referenceValid);
  }
  listByUser() {
    const userTicket: Partial<FeedbackTicket> = { ...ticket };
    delete userTicket.assignedTo;
    return Promise.resolve([userTicket as UserFeedbackTicket]);
  }
  listForAdmin() {
    return Promise.resolve([ticket]);
  }
  updateByAdmin(
    _actorKey: string,
    _feedbackId: string,
    update: FeedbackAdminUpdate,
  ) {
    this.update = update;
    return Promise.resolve({ ...ticket, ...update });
  }
}

describe("FeedbackService", () => {
  it("records explicit advice accuracy feedback", async () => {
    const repository = new MemoryFeedbackRepository();
    const service = new FeedbackService(repository);
    await service.submit("user-id", {
      accurate: false,
      kind: "STRUCTURE_ADVICE",
      referenceId: "53a3e68c-c38c-4b79-90b4-ab1212491184",
      referenceType: "PracticeSession",
    });
    assert.equal(repository.input?.accurate, false);
    assert.equal(repository.input?.kind, "STRUCTURE_ADVICE");
  });

  it("requires a concrete message and typed target for content errors", async () => {
    const service = new FeedbackService(new MemoryFeedbackRepository());
    await assert.rejects(
      () =>
        service.submit("user-id", {
          kind: "CONTENT_ERROR",
          referenceId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
          referenceType: "Artwork",
        }),
      BadRequestException,
    );
  });

  it("creates a recognition-error ticket linked to the user's artwork", async () => {
    const repository = new MemoryFeedbackRepository();
    const service = new FeedbackService(repository);
    await service.submit("user-id", {
      kind: "RECOGNITION_ERROR",
      message: "候选字里没有永",
      referenceId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
      referenceType: "Artwork",
    });
    assert.equal(repository.input?.kind, "RECOGNITION_ERROR");
    assert.equal(repository.input?.message, "候选字里没有永");
  });

  it("rejects feedback for another user's artwork", async () => {
    const repository = new MemoryFeedbackRepository();
    repository.referenceValid = false;
    const service = new FeedbackService(repository);
    await assert.rejects(
      () =>
        service.submit("user-id", {
          kind: "RECOGNITION_ERROR",
          message: "识别不正确",
          referenceId: "4b02e7dd-24de-47e3-ab13-1d4a7f952935",
          referenceType: "Artwork",
        }),
      BadRequestException,
    );
  });

  it("requires a user-visible resolution before closing a ticket", async () => {
    const service = new FeedbackService(new MemoryFeedbackRepository());
    await assert.rejects(
      () =>
        service.updateByAdmin(
          "reviewer@example.com",
          "53a3e68c-c38c-4b79-90b4-ab1212491184",
          { status: "RESOLVED" },
        ),
      BadRequestException,
    );
  });

  it("assigns and resolves feedback with an auditable public response", async () => {
    const repository = new MemoryFeedbackRepository();
    const service = new FeedbackService(repository);
    const updated = await service.updateByAdmin(
      "reviewer@example.com",
      "53a3e68c-c38c-4b79-90b4-ab1212491184",
      {
        assignedTo: "editor@example.com",
        resolutionNote: "已核对来源并下架错误范字。",
        status: "RESOLVED",
      },
      new Date("2026-07-18T01:00:00.000Z"),
    );
    assert.equal(updated.status, "RESOLVED");
    assert.equal(repository.update?.assignedTo, "editor@example.com");
  });
});
