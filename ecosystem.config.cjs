// PM2 process definition for the Staffly demo API on the Mac Mini.
//
//   pnpm --filter @staffly/api build      # produces apps/api/dist
//   pm2 start ecosystem.config.cjs        # start under PM2
//   pm2 save && pm2 startup               # persist across reboots (launchd)
//
// Secrets are NOT in this file. The API loads apps/api/.env itself at boot
// (main.ts → process.loadEnvFile), so the gitignored apps/api/.env holds
// DATABASE_URL, JWT_SECRET, R2 credentials, SENTRY_DSN, etc.
//
// VPS portability: this config is platform-agnostic. On a future Linux VPS
// the only change is the service-manager registration (pm2 startup emits the
// correct systemd unit instead of launchd).

module.exports = {
  apps: [
    {
      name: "staffly-api",
      cwd: "./apps/api",
      script: "dist/main.js",
      node_args: "--enable-source-maps",
      // Single instance: Prisma + a single Postgres connection pool, and the
      // demo load does not warrant cluster mode. Revisit for production.
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      // Restart if the process leaks past this — bounds blast radius on the
      // memory-constrained Mini.
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      // PM2 captures stdout/stderr. Pair with pm2-logrotate to bound disk
      // (the Mini has hit StorageFull — keep logs capped).
      out_file: "./.pm2/staffly-api.out.log",
      error_file: "./.pm2/staffly-api.err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
