import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { TenantBoundaryViolation } from "../tenant/tenant-context";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof TenantBoundaryViolation) {
      res.status(HttpStatus.FORBIDDEN).json({
        error: {
          code: "tenant.boundary_violation",
          message: exception.message,
        },
      } satisfies ErrorEnvelope);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const envelope =
        typeof body === "object" && body !== null
          ? this.normalize(body as Record<string, unknown>, status)
          : this.normalize({ message: String(body) }, status);
      res.status(status).json(envelope);
      return;
    }

    this.logger.error("Unhandled exception", exception as Error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "internal_error", message: "Internal server error" },
    } satisfies ErrorEnvelope);
  }

  private normalize(
    body: Record<string, unknown>,
    status: number,
  ): ErrorEnvelope {
    const code =
      (typeof body.code === "string" && body.code) ||
      this.defaultCode(status);
    const message =
      (typeof body.message === "string" && body.message) ||
      (Array.isArray(body.message) ? body.message.join("; ") : code);
    const { code: _c, message: _m, ...rest } = body;
    const details = Object.keys(rest).length > 0 ? rest : undefined;
    return { error: { code, message, ...(details ? { details } : {}) } };
  }

  private defaultCode(status: number): string {
    switch (status) {
      case 400:
        return "validation.failed";
      case 401:
        return "auth.unauthenticated";
      case 403:
        return "auth.forbidden";
      case 404:
        return "not_found";
      case 409:
        return "conflict";
      case 423:
        return "account.locked";
      default:
        return "error";
    }
  }
}
