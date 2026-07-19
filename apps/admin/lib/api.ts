export interface AdminSession {
  accessToken: string;
  staff: { email: string; roles: string[] };
}

export interface AdminCalligrapher {
  biography: string | null;
  dynasty: string;
  id: string;
  isActive: boolean;
  name: string;
}

export interface AdminWork {
  calligrapher: { id: string; isActive: boolean; name: string };
  description: string | null;
  dynasty: string;
  id: string;
  isActive: boolean;
  title: string;
}

export interface AdminEdition {
  holdingInstitution: string | null;
  id: string;
  isActive: boolean;
  name: string;
  publication: string | null;
  sourceUrl: string | null;
  work: {
    calligrapher: { isActive: boolean };
    id: string;
    isActive: boolean;
    title: string;
  };
}

export interface AdminRights {
  allowCommercial: boolean;
  attributionText: string | null;
  id: string;
  licenseName: string | null;
  maxPublicWidth: number | null;
  notes: string | null;
  sourceName: string;
  sourceUrl: string | null;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
}

export interface AdminContentHistoryEntry {
  action: string;
  actorKey: string;
  canRestore: boolean;
  changes: Array<{ after: unknown; before: unknown; field: string }>;
  createdAt: string;
  entityId: string;
  entityType: string;
  id: string;
  snapshot: unknown;
}

export interface AdminSourceAsset {
  edition: { name: string; work: { title: string } };
  height: number;
  id: string;
  pageLabel: string | null;
  width: number;
}

export interface AdminSegmentationJob {
  algorithmVersion: string | null;
  candidates: Array<{
    bboxHeight: number;
    bboxWidth: number;
    bboxX: number;
    bboxY: number;
    confidence: number;
    annotatedAt: string | null;
    annotatedBy: string | null;
    glyphId: string | null;
    id: string;
    rejectionNote: string | null;
    sortOrder: number;
    status: string;
  }>;
  completedAt: string | null;
  createdAt: string;
  failureCode: string | null;
  failureMessage: string | null;
  id: string;
  requestedBy: string;
  sourceAsset: {
    edition: { name: string; work: { title: string } };
    height: number;
    id: string;
    pageLabel: string | null;
    width: number;
  };
  startedAt: string | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
}

export interface AdminGlyph {
  authenticityGrade:
    | "A_ORIGINAL"
    | "B_RUBBING_OR_AUTHORIZED_EDITION"
    | "C_MODERN_COPY"
    | "D_AI_GENERATED";
  bboxHeight: number;
  bboxWidth: number;
  bboxX: number;
  bboxY: number;
  beginnerWeight: number;
  character: { value: string };
  contentStatus: string;
  id: string;
  imageQuality: number;
  annotatedBy: string | null;
  labelCandidates: unknown;
  observedCharacter: string | null;
  sourceAsset: { edition: { work: { title: string } } };
  transcription: string | null;
}

export interface PrivateSourceView {
  expiresAt: string;
  height: number;
  mimeType: string;
  url: string;
  width: number;
}

export interface AdminContentImportBatch {
  actorKey: string;
  checksumSha256: string;
  committedAt: string | null;
  createdAt: string;
  fileName: string;
  id: string;
  invalidRows: number;
  rows: Array<{
    errors: string[];
    normalizedData: Record<string, unknown> | null;
    rawData: Record<string, string>;
    rowNumber: number;
    targetGlyphId: string | null;
  }>;
  status: "INVALID" | "READY" | "COMMITTED";
  totalRows: number;
  validRows: number;
}

export interface AdminFeedbackTicket {
  accurate: boolean | null;
  assignedTo: string | null;
  createdAt: string;
  id: string;
  kind:
    | "STRUCTURE_ADVICE"
    | "RECOGNITION_ERROR"
    | "QUALITY_RESULT"
    | "CONTENT_ERROR"
    | "PRODUCT";
  message: string | null;
  referenceId: string | null;
  referenceType: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  updatedAt: string;
}

export interface AdminAdviceSample {
  advice: {
    measurement_version?: string;
    model_version?: string;
    normalization_version?: string;
    status?: "OK" | "LOW_CONFIDENCE";
    suggestions?: Array<{
      action?: string;
      evidence?: string;
      phenomenon?: string;
    }>;
    threshold_version?: string;
  };
  attemptCreatedAt: string;
  attemptId: string;
  character: string;
  master: {
    calligrapherName: string;
    imageUrl: string | null;
    workTitle: string;
  };
  practiceSessionId: string;
  review: {
    comment: string;
    reviewedAt: string;
    reviewerKey: string;
    verdict: "APPROVED" | "NEEDS_ADJUSTMENT" | "NOT_APPLICABLE";
  } | null;
  sequence: number;
  userImageUrl: string;
}

export interface AdminFunnelReport {
  completionRate: number | null;
  from: string;
  stages: Array<{
    conversionFromPrevious: number | null;
    count: number;
    name:
      | "ARTWORK_UPLOAD_COMPLETED"
      | "CHARACTER_CONFIRMED"
      | "CATALOG_RESULTS_VIEWED"
      | "GLYPH_SELECTED"
      | "PRACTICE_CREATED"
      | "ADVICE_VIEWED"
      | "SECOND_ATTEMPT_STARTED"
      | "PRACTICE_COMPLETED";
  }>;
  to: string;
}

type Fetcher = typeof fetch;

export function adminApiBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(normalized)) {
    throw new Error("后台 API 地址未正确配置。");
  }
  return normalized;
}

async function requestJson<T>(
  apiBaseUrl: string,
  path: string,
  init: RequestInit,
  fetcher: Fetcher = fetch,
): Promise<T> {
  const response = await fetcher(`${adminApiBaseUrl(apiBaseUrl)}${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as null | {
      message?: string;
    };
    throw new Error(body?.message ?? `请求失败（${response.status}）`);
  }
  return (await response.json()) as T;
}

export function createAdminSession(
  apiBaseUrl: string,
  email: string,
  password: string,
  fetcher?: Fetcher,
): Promise<AdminSession> {
  return requestJson(
    apiBaseUrl,
    "/admin/session",
    {
      body: JSON.stringify({ email, password }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    fetcher,
  );
}

export function getAdminContent<T>(
  apiBaseUrl: string,
  token: string,
  resource: string,
  fetcher?: Fetcher,
): Promise<T> {
  return requestJson(
    apiBaseUrl,
    `/admin/content/${resource}`,
    { headers: { Authorization: `Bearer ${token}` }, method: "GET" },
    fetcher,
  );
}

export async function getAdminContentText(
  apiBaseUrl: string,
  token: string,
  resource: string,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await fetcher(
    `${adminApiBaseUrl(apiBaseUrl)}/admin/content/${resource}`,
    { headers: { Authorization: `Bearer ${token}` }, method: "GET" },
  );
  if (!response.ok) {
    throw new Error(`请求失败（${response.status}）`);
  }
  return response.text();
}

export function createAdminContent<T>(
  apiBaseUrl: string,
  token: string,
  resource: string,
  body: Record<string, unknown>,
  fetcher?: Fetcher,
): Promise<T> {
  return requestJson(
    apiBaseUrl,
    `/admin/content/${resource}`,
    {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetcher,
  );
}

export function updateAdminContent<T>(
  apiBaseUrl: string,
  token: string,
  resource: string,
  body: Record<string, unknown>,
  fetcher?: Fetcher,
): Promise<T> {
  return requestJson(
    apiBaseUrl,
    `/admin/content/${resource}`,
    {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
    fetcher,
  );
}

export function getAdminFeedback(
  apiBaseUrl: string,
  token: string,
  fetcher?: Fetcher,
): Promise<AdminFeedbackTicket[]> {
  return requestJson(
    apiBaseUrl,
    "/admin/feedback",
    { headers: { Authorization: `Bearer ${token}` }, method: "GET" },
    fetcher,
  );
}

export function updateAdminFeedback(
  apiBaseUrl: string,
  token: string,
  feedbackId: string,
  body: Record<string, unknown>,
  fetcher?: Fetcher,
): Promise<AdminFeedbackTicket> {
  return requestJson(
    apiBaseUrl,
    `/admin/feedback/${encodeURIComponent(feedbackId)}`,
    {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
    fetcher,
  );
}

export function getAdminAdviceSamples(
  apiBaseUrl: string,
  token: string,
  status: "ALL" | "REVIEWED" | "UNREVIEWED" = "UNREVIEWED",
  fetcher?: Fetcher,
): Promise<AdminAdviceSample[]> {
  return requestJson(
    apiBaseUrl,
    `/admin/advice-reviews?status=${status}&limit=20`,
    { headers: { Authorization: `Bearer ${token}` }, method: "GET" },
    fetcher,
  );
}

export function reviewAdminAdvice(
  apiBaseUrl: string,
  token: string,
  attemptId: string,
  body: { comment: string; verdict: string },
  fetcher?: Fetcher,
): Promise<{ attemptId: string; status: "REVIEWED"; verdict: string }> {
  return requestJson(
    apiBaseUrl,
    `/admin/advice-reviews/${encodeURIComponent(attemptId)}`,
    {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
    fetcher,
  );
}

export function getAdminFunnel(
  apiBaseUrl: string,
  token: string,
  fetcher?: Fetcher,
): Promise<AdminFunnelReport> {
  return requestJson(
    apiBaseUrl,
    "/admin/analytics/funnel",
    { headers: { Authorization: `Bearer ${token}` }, method: "GET" },
    fetcher,
  );
}
