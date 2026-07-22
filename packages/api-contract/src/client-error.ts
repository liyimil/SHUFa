const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const errorCodePattern = /^[A-Z][A-Z0-9_:-]{0,99}$/;

interface ApiErrorResponse {
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  status: number;
}

function safeString(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .trim();
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function responseRequestId(response: ApiErrorResponse): string | null {
  const value = response.headers.get("x-request-id");
  return value && requestIdPattern.test(value) ? value : null;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function readApiClientError(
  response: ApiErrorResponse,
  fallbackMessage = "请求失败",
): Promise<ApiClientError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Gateways may return HTML or an empty body; status and request ID remain useful.
  }
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  const requestId = responseRequestId(response);
  const rawCode = safeString(record?.code, 100);
  const code = rawCode && errorCodePattern.test(rawCode) ? rawCode : null;
  const detail = safeString(record?.message, 500);
  const base = detail ?? `${fallbackMessage}（${response.status}）`;
  const diagnostics = [
    code ? `错误代码：${code}` : null,
    requestId ? `追踪 ID：${requestId}` : null,
  ].filter(Boolean);
  const message =
    diagnostics.length > 0 ? `${base}；${diagnostics.join("；")}` : base;
  return new ApiClientError(message, response.status, code, requestId);
}

export function apiRequestIdHint(error: unknown): string | null {
  return error instanceof ApiClientError && error.requestId
    ? `追踪 ID：${error.requestId}`
    : null;
}
