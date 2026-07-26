import { randomUUID } from "node:crypto";

import helmet from "helmet";
import { sanitizeHttpPath } from "@calligraphy/observability";

interface RequestMetadata {
  get(name: string): string | undefined;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
}

interface ResponseMetadata {
  on(event: "finish", listener: () => void): void;
  setHeader(name: string, value: string): void;
  statusCode: number;
}

/**
 * Helmet middleware for comprehensive security headers.
 * Sets: X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
 * Permissions-Policy, HSTS, X-XSS-Protection, and more.
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        ...(process.env.NODE_ENV === "production" ? [] : ["'unsafe-inline'"]),
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: "deny" },
  hsts: {
    maxAge: 15552000, // 180 days
    includeSubDomains: true,
  },
});

/**
 * Request metadata middleware: assigns a request ID and logs request completion.
 */
export function requestMetadataMiddleware(
  request: RequestMetadata,
  response: ResponseMetadata,
  next: () => void,
): void {
  const suppliedRequestId = request.get("x-request-id");
  const requestId =
    suppliedRequestId && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
  const startedAt = performance.now();

  request.headers["x-request-id"] = requestId;
  response.setHeader("X-Request-Id", requestId);
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.on("finish", () => {
    console.log(
      JSON.stringify({
        durationMs: Math.round(performance.now() - startedAt),
        event: "http_request_completed",
        method: request.method,
        path: sanitizeHttpPath(request.path),
        requestId,
        statusCode: response.statusCode,
      }),
    );
  });
  next();
}

export function corsConfiguration(configuredOrigins?: string) {
  return {
    exposedHeaders: ["X-Request-Id"],
    origin: configuredOrigins
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? ["http://localhost:3000", "http://localhost:3002"],
  };
}
