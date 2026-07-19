export const contentStatuses = [
  "DRAFT",
  "PROCESSING",
  "NEEDS_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export type ContentStatus = (typeof contentStatuses)[number];

export const scriptStyles = ["REGULAR"] as const;

export type ScriptStyle = (typeof scriptStyles)[number];
