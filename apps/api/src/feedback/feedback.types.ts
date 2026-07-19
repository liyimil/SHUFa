export const feedbackKinds = [
  "STRUCTURE_ADVICE",
  "RECOGNITION_ERROR",
  "QUALITY_RESULT",
  "CONTENT_ERROR",
  "PRODUCT",
] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];

export const feedbackStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "DISMISSED",
] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export interface FeedbackTicket {
  accurate: boolean | null;
  assignedTo: string | null;
  createdAt: Date;
  id: string;
  kind: FeedbackKind;
  message: string | null;
  referenceId: string | null;
  referenceType: string | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  status: FeedbackStatus;
  updatedAt: Date;
}

export type UserFeedbackTicket = Omit<FeedbackTicket, "assignedTo">;

export interface FeedbackAdminUpdate {
  assignedTo?: string | null;
  resolutionNote?: string | null;
  status?: FeedbackStatus;
}
