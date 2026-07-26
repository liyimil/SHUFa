import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const REFRESH_COOKIE = "calligraphy_rt";
const ACCESS_COOKIE = "calligraphy_at";
const ACCESS_TOKEN_HEADER = "x-session-access-token";
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function getApiBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:3001";
}

interface IdentitySession {
  accessToken: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
  refreshToken: string;
  tokenType: "Bearer";
  user: { id: string; kind: "anonymous" | "registered" };
}

function applySession(
  requestHeaders: Headers,
  session: IdentitySession,
): NextResponse {
  requestHeaders.set(ACCESS_TOKEN_HEADER, session.accessToken);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set cookies for browser persistence (available on next request)
  response.cookies.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFRESH_TTL_SECONDS,
  });
  response.cookies.set(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TTL_SECONDS,
  });
  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers);

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;

  // Both present — session still valid, forward access token to server components
  if (refreshToken && accessToken) {
    requestHeaders.set(ACCESS_TOKEN_HEADER, accessToken);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const base = getApiBaseUrl();

  // No refresh token — create new anonymous session
  if (!refreshToken) {
    try {
      const apiResponse = await fetch(`${base}/api/v1/identity/anonymous`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (apiResponse.ok) {
        const session: IdentitySession = await apiResponse.json();
        return applySession(requestHeaders, session);
      }
    } catch {
      // API unavailable — continue without session
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Refresh token exists but access token missing/expired — refresh session
  try {
    const apiResponse = await fetch(`${base}/api/v1/identity/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (apiResponse.ok) {
      const session: IdentitySession = await apiResponse.json();
      return applySession(requestHeaders, session);
    } else if (apiResponse.status === 401 || apiResponse.status === 403) {
      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      response.cookies.delete(REFRESH_COOKIE);
      response.cookies.delete(ACCESS_COOKIE);
      return response;
    }
  } catch {
    // API unavailable — continue without session
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|icon.svg|api/internal).*)",
  ],
};
