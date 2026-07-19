import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  FEEDBACK_REPOSITORY,
  type FeedbackRepository,
} from "./feedback.repository.js";
import {
  type FeedbackAdminUpdate,
  type FeedbackKind,
  feedbackKinds,
  type FeedbackStatus,
  feedbackStatuses,
} from "./feedback.types.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requiredReferenceType: Partial<Record<FeedbackKind, string>> = {
  CONTENT_ERROR: "Glyph",
  QUALITY_RESULT: "Artwork",
  RECOGNITION_ERROR: "Artwork",
  STRUCTURE_ADVICE: "PracticeSession",
};

function optionalMessage(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const message = typeof value === "string" ? value.trim() : "";
  if (!message || message.length > 2_000) {
    throw new BadRequestException({ code: "INVALID_FEEDBACK_MESSAGE" });
  }
  return message;
}

@Injectable()
export class FeedbackService {
  constructor(
    @Inject(FEEDBACK_REPOSITORY)
    private readonly repository: FeedbackRepository,
  ) {}

  async submit(userId: string, raw: Record<string, unknown>) {
    const kind = String(raw.kind ?? "") as FeedbackKind;
    if (!feedbackKinds.includes(kind)) {
      throw new BadRequestException({ code: "INVALID_FEEDBACK_KIND" });
    }
    const referenceId =
      raw.referenceId == null ? null : String(raw.referenceId);
    if (referenceId && !uuidPattern.test(referenceId)) {
      throw new BadRequestException({ code: "INVALID_FEEDBACK_REFERENCE" });
    }
    const referenceType =
      raw.referenceType == null ? null : String(raw.referenceType).trim();
    const expectedReferenceType = requiredReferenceType[kind];
    if (
      expectedReferenceType &&
      (!referenceId || referenceType !== expectedReferenceType)
    ) {
      throw new BadRequestException({
        code: "INVALID_FEEDBACK_REFERENCE",
        message: "反馈对象与反馈类型不匹配。",
      });
    }
    if (
      referenceId &&
      !(await this.repository.isValidReference(userId, kind, referenceId))
    ) {
      throw new BadRequestException({
        code: "INVALID_FEEDBACK_REFERENCE",
        message: "反馈对象不存在、不可公开，或不属于当前用户。",
      });
    }
    if ((referenceType?.length ?? 0) > 100) {
      throw new BadRequestException({ code: "FEEDBACK_TOO_LONG" });
    }
    const message = optionalMessage(raw.message);
    if (
      [
        "CONTENT_ERROR",
        "QUALITY_RESULT",
        "RECOGNITION_ERROR",
        "PRODUCT",
      ].includes(kind) &&
      !message
    ) {
      throw new BadRequestException({
        code: "FEEDBACK_MESSAGE_REQUIRED",
        message: "请说明具体问题，便于复核。",
      });
    }
    const accurate = typeof raw.accurate === "boolean" ? raw.accurate : null;
    if (kind === "STRUCTURE_ADVICE" && accurate === null) {
      throw new BadRequestException({ code: "FEEDBACK_ACCURACY_REQUIRED" });
    }
    return this.repository.create({
      accurate,
      kind,
      message,
      referenceId,
      referenceType: referenceType || null,
      userId,
    });
  }

  listForUser(userId: string) {
    return this.repository.listByUser(userId);
  }

  listForAdmin(raw: Record<string, unknown>) {
    const filters: { kind?: FeedbackKind; status?: FeedbackStatus } = {};
    if (raw.kind !== undefined && raw.kind !== "") {
      const kind = String(raw.kind) as FeedbackKind;
      if (!feedbackKinds.includes(kind)) {
        throw new BadRequestException({ code: "INVALID_FEEDBACK_KIND" });
      }
      filters.kind = kind;
    }
    if (raw.status !== undefined && raw.status !== "") {
      const status = String(raw.status) as FeedbackStatus;
      if (!feedbackStatuses.includes(status)) {
        throw new BadRequestException({ code: "INVALID_FEEDBACK_STATUS" });
      }
      filters.status = status;
    }
    return this.repository.listForAdmin(filters);
  }

  async updateByAdmin(
    actorKey: string,
    feedbackId: string,
    raw: Record<string, unknown>,
    now: Date = new Date(),
  ) {
    if (!uuidPattern.test(feedbackId)) {
      throw new BadRequestException({ code: "INVALID_FEEDBACK_REFERENCE" });
    }
    const update: FeedbackAdminUpdate = {};
    if (Object.hasOwn(raw, "assignedTo")) {
      const assignedTo = optionalMessage(raw.assignedTo);
      if (
        assignedTo &&
        (assignedTo.length > 100 || !assignedTo.includes("@"))
      ) {
        throw new BadRequestException({ code: "INVALID_FEEDBACK_ASSIGNEE" });
      }
      update.assignedTo = assignedTo;
    }
    if (Object.hasOwn(raw, "resolutionNote")) {
      update.resolutionNote = optionalMessage(raw.resolutionNote);
    }
    if (Object.hasOwn(raw, "status")) {
      const status = String(raw.status ?? "") as FeedbackStatus;
      if (!feedbackStatuses.includes(status)) {
        throw new BadRequestException({ code: "INVALID_FEEDBACK_STATUS" });
      }
      update.status = status;
    }
    if (Object.keys(update).length === 0) {
      throw new BadRequestException({ code: "EMPTY_FEEDBACK_UPDATE" });
    }
    if (
      update.status &&
      ["RESOLVED", "DISMISSED"].includes(update.status) &&
      !update.resolutionNote
    ) {
      throw new BadRequestException({
        code: "FEEDBACK_RESOLUTION_REQUIRED",
        message: "关闭工单前必须填写用户可见的处理说明。",
      });
    }
    const updated = await this.repository.updateByAdmin(
      actorKey,
      feedbackId,
      update,
      now,
    );
    if (!updated) {
      throw new NotFoundException({ code: "FEEDBACK_NOT_FOUND" });
    }
    return updated;
  }
}
