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

/**
 * Extract the most useful user-facing message from any thrown value.
 *
 * - `validation.failed` responses include a `details.issues` array from the
 *   backend's Zod pipe. We surface the first issue's path + message so the
 *   user sees "pageSize: Number must be less than or equal to 100" instead of
 *   the generic code.
 * - Any other ApiError: use the `message` field.
 * - Plain Error: use `message`.
 * - Fallback: return the provided `fallback` string.
 */
export function extractErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred",
): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : fallback;
  }

  if (err.code === "validation.failed") {
    const details = err.details as
      | {
          error?: {
            details?: { issues?: { path: string; message: string }[] };
          };
        }
      | undefined;
    const issues = details?.error?.details?.issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0] as { path: string; message: string } | undefined;
      if (first) {
        return first.path ? `${first.path}: ${first.message}` : first.message;
      }
    }
  }

  return err.message || fallback;
}
