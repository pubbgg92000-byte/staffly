// Sentry — server runtime init (admin portal). Loaded via instrumentation.ts.
// No-op when NEXT_PUBLIC_SENTRY_DSN is unset (local/CI).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
});
