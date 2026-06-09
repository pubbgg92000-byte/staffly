import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@staffly/ui", "@staffly/types", "@staffly/i18n"],
};

// Apply the Sentry build plugin only when a DSN is configured (Vercel prod).
// Local/CI builds run without it, keeping the build deterministic and free of
// the Sentry webpack plugin + source-map upload step.
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    })
  : config;
