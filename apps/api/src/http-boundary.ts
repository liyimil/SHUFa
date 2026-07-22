import { randomUUID } from "node:crypto";

import { sanitizeHttpPath } from "@calligraphy/observability";

interface RequestMetadata {
  get(name: string): string | undefined;
  method: string;
  path: string;
}

interface ResponseMetadata {
  on(event: "finish", listener: () => void): void;
  setHeader(name: string, value: string): void;
  statusCode: number;
}

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

  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.setHeader("X-Request-Id", requestId);
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
    origin: configuredOrigins?.split(",") ?? [
      "http://localhost:3000",
      "http://localhost:3002",
    ],
  };
}
