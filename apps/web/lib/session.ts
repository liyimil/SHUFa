import { cookies, headers } from "next/headers";

const ACCESS_COOKIE = "calligraphy_at";
const ACCESS_TOKEN_HEADER = "x-session-access-token";

/**
 * Returns the access token for the current request.
 * Reads from the request header set by middleware (works on first request).
 * Falls back to the access cookie (set by middleware on prior requests).
 */
export async function getAccessToken(): Promise<string | null> {
  const headerStore = await headers();
  const headerToken = headerStore.get(ACCESS_TOKEN_HEADER);
  if (headerToken) return headerToken;

  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value ?? null;
}

/**
 * Returns Authorization headers for API calls, or an empty record when no session exists.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
