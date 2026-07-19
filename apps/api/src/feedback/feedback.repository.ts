import type {
  FeedbackAdminUpdate,
  FeedbackKind,
  FeedbackStatus,
  FeedbackTicket,
  UserFeedbackTicket,
} from "./feedback.types.js";

export const FEEDBACK_REPOSITORY = Symbol("FEEDBACK_REPOSITORY");

export interface FeedbackRepository {
  create(input: {
    accurate: boolean | null;
    kind: FeedbackKind;
    message: string | null;
    referenceId: string | null;
    referenceType: string | null;
    userId: string;
  }): Promise<{ id: string; status: FeedbackStatus }>;
  isValidReference(
    userId: string,
    kind: FeedbackKind,
    referenceId: string,
  ): Promise<boolean>;
  listByUser(userId: string): Promise<UserFeedbackTicket[]>;
  listForAdmin(filters: {
    kind?: FeedbackKind;
    status?: FeedbackStatus;
  }): Promise<FeedbackTicket[]>;
  updateByAdmin(
    actorKey: string,
    feedbackId: string,
    update: FeedbackAdminUpdate,
    now: Date,
  ): Promise<FeedbackTicket | null>;
}
