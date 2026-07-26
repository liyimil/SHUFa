import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HttpException, HttpStatus, type ArgumentsHost } from "@nestjs/common";

import { GlobalExceptionFilter } from "../src/global-exception.filter.js";

interface MockResponse {
  getStatusCode(): number;
  getBody(): unknown;
}

function createMockHost(
  request: {
    headers?: Record<string, string>;
    method?: string;
    path?: string;
  } = {},
): ArgumentsHost {
  let statusCode = 200;
  let body: unknown = null;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(data: unknown) {
      body = data;
      return response;
    },
    getStatusCode() {
      return statusCode;
    },
    getBody() {
      return body;
    },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: request.headers ?? {},
        method: request.method ?? "GET",
        path: request.path ?? "/test",
      }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe("GlobalExceptionFilter", () => {
  const filter = new GlobalExceptionFilter();

  it("standardizes a NotFoundException", () => {
    const host = createMockHost({ headers: { "x-request-id": "req-123" } });
    const exception = new HttpException(
      { code: "NOT_FOUND", message: "Glyph not found." },
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse() as MockResponse;
    assert.equal(response.getStatusCode(), 404);
    const body = response.getBody() as {
      code: string;
      message: string;
      requestId: string;
    };
    assert.equal(body.code, "NOT_FOUND");
    assert.equal(body.message, "Glyph not found.");
    assert.equal(body.requestId, "req-123");
  });

  it("standardizes a BadRequestException", () => {
    const host = createMockHost();
    const exception = new HttpException(
      { code: "INVALID_INPUT", message: "Character is required." },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse() as MockResponse;
    assert.equal(response.getStatusCode(), 400);
    const body = response.getBody() as { code: string; message: string };
    assert.equal(body.code, "INVALID_INPUT");
    assert.equal(body.message, "Character is required.");
  });

  it("derives code from status when not provided", () => {
    const host = createMockHost();
    const exception = new HttpException(
      "Unauthorized",
      HttpStatus.UNAUTHORIZED,
    );

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse() as MockResponse;
    assert.equal(response.getStatusCode(), 401);
    const body = response.getBody() as { code: string; message: string };
    assert.equal(body.code, "UNAUTHORIZED");
    assert.equal(body.message, "Unauthorized");
  });

  it("handles non-HttpException errors as 500", () => {
    const host = createMockHost();
    const exception = new Error("Database connection failed");

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse() as MockResponse;
    assert.equal(response.getStatusCode(), 500);
    const body = response.getBody() as { code: string; message: string };
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.equal(body.message, "服务器内部错误，请稍后重试。");
  });

  it("includes details when provided", () => {
    const host = createMockHost();
    const exception = new HttpException(
      {
        code: "VALIDATION_ERROR",
        message: "Invalid input.",
        details: ["field1 is required"],
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse() as MockResponse;
    const body = response.getBody() as { code: string; details: string[] };
    assert.deepEqual(body.details, ["field1 is required"]);
  });

  it("handles rate limit exceptions", () => {
    const host = createMockHost();
    const exception = new HttpException(
      { code: "RATE_LIMITED", message: "Too many requests." },
      HttpStatus.TOO_MANY_REQUESTS,
    );

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse() as MockResponse;
    assert.equal(response.getStatusCode(), 429);
    const body = response.getBody() as { code: string };
    assert.equal(body.code, "RATE_LIMITED");
  });

  it("omits requestId when not present", () => {
    const host = createMockHost();
    const exception = new HttpException(
      { code: "NOT_FOUND", message: "Not found." },
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse() as MockResponse;
    const body = response.getBody() as { requestId?: string };
    assert.equal(body.requestId, undefined);
  });
});
