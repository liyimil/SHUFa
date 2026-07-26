import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import {
  sanitizeDiagnosticMessage,
  sanitizeHttpPath,
} from "@calligraphy/observability";
import type { Request, Response } from "express";

interface StandardizedErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("GlobalExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const requestId = request.headers["x-request-id"] as string | undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "服务器内部错误，请稍后重试。";
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === "object" &&
        exceptionResponse !== null
      ) {
        const body = exceptionResponse as Record<string, unknown>;
        code = (body.code as string) ?? this.deriveCodeFromStatus(status);
        message = (body.message as string) ?? message;
        details = body.details ?? body.errors;
      }

      if (code === "INTERNAL_ERROR") {
        code = this.deriveCodeFromStatus(status);
      }
    } else {
      this.logUnexpectedError(exception, request);
    }

    const errorBody: StandardizedErrorBody = {
      code,
      message,
      ...(details !== undefined && { details }),
      ...(requestId && { requestId }),
    };

    response.status(status).json(errorBody);
  }

  private deriveCodeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return "UNPROCESSABLE_ENTITY";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "RATE_LIMITED";
      default:
        return "ERROR";
    }
  }

  private logUnexpectedError(exception: unknown, request: Request): void {
    this.logger.error(
      `Unhandled exception: ${sanitizeDiagnosticMessage(exception)}`,
      undefined,
      `${request.method} ${sanitizeHttpPath(request.path)}`,
    );
  }
}
