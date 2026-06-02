/**
 * Normalized client-side error for every non-2xx response from the API.
 *
 * The backend's response envelope (see apps/api/src/common/http-exception.filter.ts)
 * always shapes errors as `{ error: { code, message, ... } }`. We unwrap that
 * once at the fetch boundary so callers can rely on a flat `{ status, code,
 * message }` shape.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(opts: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
