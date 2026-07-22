import { readApiClientError, type operations } from "@calligraphy/api-contract";

export { ApiClientError as ApiRequestError } from "@calligraphy/api-contract";

export type ArtworkMimeType = "image/jpeg" | "image/png" | "image/webp";

export type IdentitySession =
  operations["IdentityController_createAnonymousSession"]["responses"][201]["content"]["application/json"];

export type CreateUploadResponse =
  operations["UploadController_createUpload"]["responses"][201]["content"]["application/json"];

type CompleteUploadResponse =
  operations["UploadController_completeUpload"]["responses"][201]["content"]["application/json"];

export interface QualityFinding {
  code: string;
  message: string;
  severity: "warning" | "error";
}

export type ArtworkAnalysisResponse =
  operations["AnalysisController_getArtwork"]["responses"][200]["content"]["application/json"];

export type ArtworkDeletionView =
  operations["PracticeController_deleteArtwork"]["responses"][200]["content"]["application/json"];

export interface CatalogGlyph {
  authenticityGrade:
    "A_ORIGINAL" | "B_RUBBING_OR_AUTHORIZED_EDITION" | "C_MODERN_COPY";
  calligrapher: { dynasty: string; id: string; name: string };
  edition: {
    holdingInstitution: string | null;
    id: string;
    name: string;
    sourceUrl: string | null;
  };
  id: string;
  image: null | { height: number; id: string; url: string; width: number };
  rights: {
    attributionText: string | null;
    licenseName: string | null;
    sourceName: string;
    sourceUrl: string | null;
  };
  scriptStyle: "REGULAR";
  work: { id: string; title: string };
}

export interface CatalogFilters {
  calligrapherId?: string;
  scriptStyle?: "REGULAR";
  workId?: string;
}

export interface CatalogResult {
  canonicalCharacter: string | null;
  facets: {
    calligraphers: Array<{ dynasty: string; id: string; name: string }>;
    scriptStyles: Array<"REGULAR">;
    works: Array<{ calligrapherId: string; id: string; title: string }>;
  };
  filters: CatalogFilters;
  glyphs: CatalogGlyph[];
  query: string;
}

export type FavoriteLibrary =
  operations["PracticeController_listFavorites"]["responses"][200]["content"]["application/json"];

export type FavoriteGlyphItem = FavoriteLibrary["ungrouped"][number];

export interface GlyphDetail extends CatalogGlyph {
  character: string;
  publishedAt: string;
  sourceContext: {
    boundingBox: { height: number; width: number; x: number; y: number };
    pageLabel: string | null;
    sourceImage: { height: number; width: number };
  };
}

export type PracticeView =
  operations["PracticeController_createPractice"]["responses"][201]["content"]["application/json"];

export type StructureMetrics = NonNullable<
  PracticeView["attempts"][number]["advice"]
>["user"];

export type ProductEventName =
  operations["InsightsController_track"]["requestBody"]["content"]["application/json"]["name"];

export type PrivacyPreferences =
  operations["PrivacyController_get"]["responses"][200]["content"]["application/json"];

export type FeedbackKind =
  operations["FeedbackController_submit"]["requestBody"]["content"]["application/json"]["kind"];

export type FeedbackTicket =
  operations["FeedbackController_list"]["responses"][200]["content"]["application/json"][number];

type ProductEventResult =
  operations["InsightsController_track"]["responses"][201]["content"]["application/json"];

type FavoriteGroupResult =
  operations["PracticeController_createFavoriteGroup"]["responses"][201]["content"]["application/json"];

type PracticeShareResult =
  operations["PracticeController_createShare"]["responses"][201]["content"]["application/json"];

type FeedbackCreatedResult =
  operations["FeedbackController_submit"]["responses"][201]["content"]["application/json"];

type Fetcher = typeof fetch;

async function requestJson<T>(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
): Promise<T> {
  const response = await fetcher(url, init);
  if (!response.ok) {
    throw await readApiClientError(response);
  }
  return (await response.json()) as T;
}

export function normalizeApiBaseUrl(rawUrl: string): string {
  const normalized = rawUrl.trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(normalized)) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL 必须是 http 或 https 地址。");
  }
  return normalized;
}

export async function createAnonymousSession(
  apiBaseUrl: string,
  fetcher: Fetcher = fetch,
): Promise<IdentitySession> {
  return requestJson<IdentitySession>(
    `${normalizeApiBaseUrl(apiBaseUrl)}/identity/anonymous`,
    { method: "POST" },
    fetcher,
  );
}

export function upgradeAnonymousSession(
  apiBaseUrl: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<IdentitySession> {
  return requestJson<IdentitySession>(
    `${normalizeApiBaseUrl(apiBaseUrl)}/identity/session`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
    },
    fetcher,
  );
}

export function refreshAnonymousSession(
  apiBaseUrl: string,
  refreshToken: string,
  fetcher: Fetcher = fetch,
): Promise<IdentitySession> {
  return requestJson<IdentitySession>(
    `${normalizeApiBaseUrl(apiBaseUrl)}/identity/refresh`,
    {
      body: JSON.stringify({ refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    fetcher,
  );
}

export async function createArtworkUpload(
  apiBaseUrl: string,
  accessToken: string,
  input: {
    clientRequestId: string;
    height: number;
    mimeType: ArtworkMimeType;
    sizeBytes: number;
    width: number;
  },
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<CreateUploadResponse> {
  return requestJson<CreateUploadResponse>(
    `${normalizeApiBaseUrl(apiBaseUrl)}/uploads`,
    {
      body: JSON.stringify(input),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal,
    },
    fetcher,
  );
}

export async function completeArtworkUpload(
  apiBaseUrl: string,
  accessToken: string,
  uploadId: string,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<CompleteUploadResponse> {
  return requestJson<CompleteUploadResponse>(
    `${normalizeApiBaseUrl(apiBaseUrl)}/uploads/${encodeURIComponent(uploadId)}/complete`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
      signal,
    },
    fetcher,
  );
}

export async function cancelArtworkUpload(
  apiBaseUrl: string,
  accessToken: string,
  uploadId: string,
  fetcher: Fetcher = fetch,
): Promise<{ artworkId: string; status: "DELETED"; uploadId: string }> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/uploads/${encodeURIComponent(uploadId)}/cancel`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
    },
    fetcher,
  );
}

export function trackProductEvent(
  apiBaseUrl: string,
  accessToken: string,
  input: {
    eventId: string;
    name: ProductEventName;
    occurredAt: string;
    practiceSessionId?: string;
  },
  fetcher: Fetcher = fetch,
): Promise<ProductEventResult> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/events`,
    {
      body: JSON.stringify(input),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetcher,
  );
}

export async function getArtworkAnalysis(
  apiBaseUrl: string,
  accessToken: string,
  artworkId: string,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<ArtworkAnalysisResponse> {
  return requestJson<ArtworkAnalysisResponse>(
    `${normalizeApiBaseUrl(apiBaseUrl)}/artworks/${encodeURIComponent(artworkId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "GET",
      signal,
    },
    fetcher,
  );
}

export async function waitForArtworkAnalysis(
  apiBaseUrl: string,
  accessToken: string,
  artworkId: string,
  options: {
    attempts?: number;
    delay?: (milliseconds: number) => Promise<void>;
    fetcher?: Fetcher;
    intervalMilliseconds?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ArtworkAnalysisResponse> {
  const attempts = options.attempts ?? 30;
  const delay =
    options.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const interval = options.intervalMilliseconds ?? 1_000;
  let latest: ArtworkAnalysisResponse | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await getArtworkAnalysis(
      apiBaseUrl,
      accessToken,
      artworkId,
      options.fetcher,
      options.signal,
    );
    if (
      latest.analysis &&
      ["PASSED", "NEEDS_RETAKE", "FAILED"].includes(latest.analysis.status)
    ) {
      return latest;
    }
    if (attempt < attempts - 1) {
      if (options.signal?.aborted)
        throw new DOMException("Aborted", "AbortError");
      await delay(interval);
    }
  }

  if (!latest) {
    throw new Error("没有读取到作品分析状态。");
  }
  return latest;
}

export async function confirmArtworkCharacter(
  apiBaseUrl: string,
  accessToken: string,
  artworkId: string,
  character: string,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const normalized = character.trim().normalize("NFC");
  if (!/^\p{Script=Han}$/u.test(normalized)) {
    throw new Error("请输入一个汉字。");
  }
  const result = await requestJson<{ character: string }>(
    `${normalizeApiBaseUrl(apiBaseUrl)}/artworks/${encodeURIComponent(artworkId)}/character`,
    {
      body: JSON.stringify({ character: normalized }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetcher,
  );
  return result.character;
}

export async function fetchCatalog(
  apiBaseUrl: string,
  character: string,
  filters: CatalogFilters = {},
  fetcher: Fetcher = fetch,
): Promise<CatalogResult> {
  const normalized = character.trim().normalize("NFC");
  if (!/^\p{Script=Han}$/u.test(normalized)) {
    throw new Error("请输入一个汉字。");
  }
  const url = new URL(
    `${normalizeApiBaseUrl(apiBaseUrl)}/characters/${encodeURIComponent(normalized)}/glyphs`,
  );
  for (const [key, value] of Object.entries(filters)) {
    if (value) url.searchParams.set(key, value);
  }
  return requestJson<CatalogResult>(url.toString(), { method: "GET" }, fetcher);
}

export function fetchGlyphDetail(
  apiBaseUrl: string,
  glyphId: string,
  fetcher: Fetcher = fetch,
): Promise<GlyphDetail> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/glyphs/${encodeURIComponent(glyphId)}`,
    { method: "GET" },
    fetcher,
  );
}

export function createPractice(
  apiBaseUrl: string,
  accessToken: string,
  artworkId: string,
  glyphId: string,
  fetcher: Fetcher = fetch,
): Promise<PracticeView> {
  return requestJson<PracticeView>(
    `${normalizeApiBaseUrl(apiBaseUrl)}/practices`,
    {
      body: JSON.stringify({ artworkId, glyphId }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetcher,
  );
}

export function addPracticeAttempt(
  apiBaseUrl: string,
  accessToken: string,
  sessionId: string,
  artworkId: string,
  fetcher: Fetcher = fetch,
): Promise<PracticeView> {
  return requestJson<PracticeView>(
    `${normalizeApiBaseUrl(apiBaseUrl)}/practices/${encodeURIComponent(sessionId)}/attempts`,
    {
      body: JSON.stringify({ artworkId }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetcher,
  );
}

export async function favoriteGlyph(
  apiBaseUrl: string,
  accessToken: string,
  glyphId: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  await requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/favorites/glyphs/${encodeURIComponent(glyphId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "PUT",
    },
    fetcher,
  );
}

export function listFavoriteLibrary(
  apiBaseUrl: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<FavoriteLibrary> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/favorites`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "GET",
    },
    fetcher,
  );
}

export async function placeFavoriteGlyph(
  apiBaseUrl: string,
  accessToken: string,
  glyphId: string,
  groupId: string | null,
  fetcher: Fetcher = fetch,
): Promise<void> {
  await requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/favorites/glyphs/${encodeURIComponent(glyphId)}`,
    {
      body: JSON.stringify({ groupId }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
    fetcher,
  );
}

export async function unfavoriteGlyph(
  apiBaseUrl: string,
  accessToken: string,
  glyphId: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  await requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/favorites/glyphs/${encodeURIComponent(glyphId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "DELETE",
    },
    fetcher,
  );
}

export function createFavoriteGroup(
  apiBaseUrl: string,
  accessToken: string,
  name: string,
  fetcher: Fetcher = fetch,
): Promise<FavoriteGroupResult> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/favorite-groups`,
    {
      body: JSON.stringify({ name }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetcher,
  );
}

export async function deleteFavoriteGroup(
  apiBaseUrl: string,
  accessToken: string,
  groupId: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  await requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/favorite-groups/${encodeURIComponent(groupId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "DELETE",
    },
    fetcher,
  );
}

export async function reorderFavoriteGlyph(
  apiBaseUrl: string,
  accessToken: string,
  glyphId: string,
  direction: "UP" | "DOWN",
  fetcher: Fetcher = fetch,
): Promise<void> {
  await requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/favorites/glyphs/${encodeURIComponent(glyphId)}/reorder`,
    {
      body: JSON.stringify({ direction }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetcher,
  );
}

export async function reorderFavoriteGroup(
  apiBaseUrl: string,
  accessToken: string,
  groupId: string,
  direction: "UP" | "DOWN",
  fetcher: Fetcher = fetch,
): Promise<void> {
  await requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/favorite-groups/${encodeURIComponent(groupId)}/reorder`,
    {
      body: JSON.stringify({ direction }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetcher,
  );
}

export async function createPracticeShare(
  apiBaseUrl: string,
  accessToken: string,
  sessionId: string,
  fetcher: Fetcher = fetch,
): Promise<PracticeShareResult> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/practices/${encodeURIComponent(sessionId)}/shares`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
    },
    fetcher,
  );
}

export function getPractice(
  apiBaseUrl: string,
  accessToken: string,
  sessionId: string,
  fetcher: Fetcher = fetch,
): Promise<PracticeView> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/practices/${encodeURIComponent(sessionId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "GET",
    },
    fetcher,
  );
}

export function listPractices(
  apiBaseUrl: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<PracticeView[]> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/practices`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "GET",
    },
    fetcher,
  );
}

export function getPrivacyPreferences(
  apiBaseUrl: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<PrivacyPreferences> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/privacy/preferences`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "GET",
    },
    fetcher,
  );
}

export function updatePrivacyPreferences(
  apiBaseUrl: string,
  accessToken: string,
  changes: Partial<
    Pick<
      PrivacyPreferences,
      "allowArtworkStorage" | "allowModelTraining" | "allowPublicSharing"
    >
  >,
  fetcher: Fetcher = fetch,
): Promise<PrivacyPreferences> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/privacy/preferences`,
    {
      body: JSON.stringify(changes),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
    fetcher,
  );
}

export async function waitForPracticeAdvice(
  apiBaseUrl: string,
  accessToken: string,
  sessionId: string,
  attempts = 20,
  fetcher: Fetcher = fetch,
): Promise<PracticeView> {
  let latest = await getPractice(apiBaseUrl, accessToken, sessionId, fetcher);
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    const analysis = latest.attempts.at(-1);
    if (analysis?.advice || analysis?.analysis?.status === "FAILED") {
      return latest;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    latest = await getPractice(apiBaseUrl, accessToken, sessionId, fetcher);
  }
  return latest;
}

export async function submitAdviceFeedback(
  apiBaseUrl: string,
  accessToken: string,
  practiceId: string,
  accurate: boolean,
  fetcher: Fetcher = fetch,
): Promise<void> {
  await submitFeedback(
    apiBaseUrl,
    accessToken,
    {
      accurate,
      kind: "STRUCTURE_ADVICE",
      referenceId: practiceId,
      referenceType: "PracticeSession",
    },
    fetcher,
  );
}

export async function submitFeedback(
  apiBaseUrl: string,
  accessToken: string,
  input: {
    accurate?: boolean;
    kind: FeedbackKind;
    message?: string;
    referenceId?: string;
    referenceType?: "Artwork" | "Glyph" | "PracticeSession";
  },
  fetcher: Fetcher = fetch,
): Promise<FeedbackCreatedResult> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/feedback`,
    {
      body: JSON.stringify(input),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetcher,
  );
}

export async function listFeedback(
  apiBaseUrl: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<FeedbackTicket[]> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/feedback`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "GET",
    },
    fetcher,
  );
}

export async function revokePracticeShare(
  apiBaseUrl: string,
  accessToken: string,
  shareId: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  await requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/shares/${encodeURIComponent(shareId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "DELETE",
    },
    fetcher,
  );
}

export async function deleteArtwork(
  apiBaseUrl: string,
  accessToken: string,
  artworkId: string,
  fetcher: Fetcher = fetch,
): Promise<ArtworkDeletionView> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/artworks/${encodeURIComponent(artworkId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "DELETE",
    },
    fetcher,
  );
}

export function getArtworkDeletion(
  apiBaseUrl: string,
  accessToken: string,
  deletionId: string,
  fetcher: Fetcher = fetch,
): Promise<ArtworkDeletionView> {
  return requestJson(
    `${normalizeApiBaseUrl(apiBaseUrl)}/artwork-deletions/${encodeURIComponent(deletionId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "GET",
    },
    fetcher,
  );
}

export async function waitForArtworkDeletion(
  apiBaseUrl: string,
  accessToken: string,
  deletionId: string,
  options: {
    attempts?: number;
    delay?: (milliseconds: number) => Promise<void>;
    fetcher?: Fetcher;
    intervalMilliseconds?: number;
  } = {},
): Promise<ArtworkDeletionView> {
  const attempts = options.attempts ?? 30;
  const delay =
    options.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const interval = options.intervalMilliseconds ?? 1_000;
  let latest: ArtworkDeletionView | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await getArtworkDeletion(
      apiBaseUrl,
      accessToken,
      deletionId,
      options.fetcher,
    );
    if (["DELETED", "FAILED"].includes(latest.status)) return latest;
    if (attempt < attempts - 1) await delay(interval);
  }
  if (!latest) throw new Error("没有读取到作品删除状态。");
  return latest;
}
