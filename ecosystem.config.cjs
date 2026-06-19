// Staffly PM2 process definition for a small AWS EC2 VPS.
//
// Assumes the repository is deployed to /opt/staffly/current by GitHub Actions
// or by a manual rsync release. Secrets stay outside git in:
//   /opt/staffly/shared/env/api.env
//
// The API loads apps/api/.env at boot. Next.js public env is baked at build
// time, but runtime env is still provided for server-side reads.

const path = require("node:path");

const root = process.env.STAFFLY_ROOT || __dirname;
const logDir = process.env.STAFFLY_LOG_DIR || path.join(root, ".pm2");
const nodeEnv = {
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
};

module.exports = {
  apps: [
    {
      name: "staffly-api",
      cwd: path.join(root, "apps/api"),
      script: "dist/main.js",
      interpreter: "node",
      node_args: "--enable-source-maps --max-old-space-size=256",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "384M",
      env: {
        ...nodeEnv,
        PORT: "4000",
      },
      out_file: path.join(logDir, "staffly-api.out.log"),
      error_file: path.join(logDir, "staffly-api.err.log"),
      merge_logs: true,
      time: true,
    },
    {
      name: "staffly-admin",
      cwd: path.join(root, "apps/admin"),
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3000",
      interpreter: "node",
      node_args: "--max-old-space-size=192",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "320M",
      env: {
        ...nodeEnv,
        PORT: "3000",
      },
      out_file: path.join(logDir, "staffly-admin.out.log"),
      error_file: path.join(logDir, "staffly-admin.err.log"),
      merge_logs: true,
      time: true,
    },
    {
      name: "staffly-employee",
      cwd: path.join(root, "apps/employee"),
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3001",
      interpreter: "node",
      node_args: "--max-old-space-size=192",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "320M",
      env: {
        ...nodeEnv,
        PORT: "3001",
      },
      out_file: path.join(logDir, "staffly-employee.out.log"),
      error_file: path.join(logDir, "staffly-employee.err.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
