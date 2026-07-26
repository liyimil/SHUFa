import { readApiClientError, type operations } from "@calligraphy/api-contract";

type JsonResponse<
  Operation extends keyof operations,
  Status extends keyof operations[Operation]["responses"],
> = operations[Operation]["responses"][Status] extends {
  content: { "application/json": infer Body };
}
  ? Body
  : never;

type JsonRequest<Operation extends keyof operations> =
  operations[Operation] extends {
    requestBody: { content: { "application/json": infer Body } };
  }
    ? Body
    : never;

export type AdminSession = JsonResponse<
  "AdminSessionController_createSession",
  201
>;
export type AdminCalligrapher = JsonResponse<
  "ContentAdminController_listCalligraphers",
  200
>[number];
export type AdminWork = JsonResponse<
  "ContentAdminController_listWorks",
  200
>[number];
export type AdminEdition = JsonResponse<
  "ContentAdminController_listEditions",
  200
>[number];
export type AdminRights = JsonResponse<
  "ContentAdminController_listRights",
  200
>[number];
export type AdminContentHistoryEntry = JsonResponse<
  "ContentAdminController_listContentHistory",
  200
>[number];
export type AdminSourceAsset = JsonResponse<
  "ContentAdminController_listSourceAssets",
  200
>[number];
export type AdminSegmentationJob = JsonResponse<
  "ContentAdminController_listSegmentationJobs",
  200
>[number];
export type AdminGlyph = JsonResponse<
  "ContentAdminController_listGlyphs",
  200
>[number];

export type PrivateSourceView = JsonResponse<
  "ContentAdminController_createSourceAssetView",
  200
>;

export type AdminContentImportBatch = JsonResponse<
  "ContentAdminController_listContentImportBatches",
  200
>[number];
export type AdminFeedbackTicket = JsonResponse<
  "AdminFeedbackController_list",
  200
>[number];
export type AdminAdviceSample = JsonResponse<
  "AdminInsightsController_listAdviceSamples",
  200
>[number];
export type AdminFunnelReport = JsonResponse<
  "AdminInsightsController_funnel",
  200
>;

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
    throw await readApiClientError(response);
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
    throw await readApiClientError(response);
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
  body: JsonRequest<"AdminFeedbackController_update">,
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
  body: JsonRequest<"AdminInsightsController_reviewAdvice">,
  fetcher?: Fetcher,
): Promise<JsonResponse<"AdminInsightsController_reviewAdvice", 200>> {
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
