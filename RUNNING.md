# Running Staffly locally

How to bring up all three servers (Admin, Employee, API) plus the dev infra stack.

## Prerequisites

- Node.js **22+**
- pnpm **11.5+** (`corepack enable && corepack prepare pnpm@11.5.0 --activate`)
- Docker — OrbStack, Docker Desktop, or equivalent

## First-time setup

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Create local env files from the examples
cp apps/api/.env.example          apps/api/.env
cp apps/admin/.env.local.example  apps/admin/.env.local
cp apps/employee/.env.local.example apps/employee/.env.local
```

Edit `apps/api/.env` and set real values for `JWT_SECRET` and `APP_DATA_ENC_KEY` (any long random string / 32-byte base64 key respectively). The other defaults match the docker-compose stack.

```bash
# 3. Start the dev infra (Postgres :5433, Redis :6379, Mailhog :1025/:8025, MinIO :9000/:9001)
docker compose -f infra/docker-compose.dev.yml up -d

# 4. Apply migrations and seed the database
pnpm --filter @staffly/api prisma:migrate:deploy
pnpm --filter @staffly/api db:seed          # roles, permissions, catalog data
pnpm --filter @staffly/api db:seed:dev      # dev users (see table below)
```

## Start all servers

From the repo root:

```bash
pnpm dev
```

Turborepo runs all three apps concurrently:

| App             | Command                          | URL                           |
| --------------- | -------------------------------- | ----------------------------- |
| Admin portal    | `next dev --port 3000`           | http://localhost:3000         |
| Employee portal | `next dev --port 3001`           | http://localhost:3001         |
| API             | `nest start --watch` (port 4000) | http://localhost:4000         |
| API health      | —                                | http://localhost:4000/healthz |

Stop with `Ctrl+C`. The infra stack keeps running in Docker — stop it with `docker compose -f infra/docker-compose.dev.yml down`.

## Dev seed users

| Role          | Email                      | Password       | Logs into       |
| ------------- | -------------------------- | -------------- | --------------- |
| `super_admin` | `superadmin@staffly.local` | `Admin@123`    | Admin portal    |
| `hr_admin`    | `hr@staffly.local`         | `HR@123`       | Admin portal    |
| `manager`     | `manager@staffly.local`    | `Manager@123`  | Admin portal    |
| `employee`    | `employee@staffly.local`   | `Employee@123` | Employee portal |

## Running a single server

```bash
pnpm --filter @staffly/api      dev   # API only (port 4000)
pnpm --filter @staffly/admin    dev   # Admin only (port 3000)
pnpm --filter @staffly/employee dev   # Employee only (port 3001)
```

## Dev infra ports

| Service | Host port    | Notes                                    |
| ------- | ------------ | ---------------------------------------- |
| Postgres | 5433        | Mapped from container 5432               |
| Redis    | 6379        |                                          |
| Mailhog  | 1025 / 8025 | SMTP / web UI at http://localhost:8025   |
| MinIO    | 9000 / 9001 | S3 API / console at http://localhost:9001 |

## Common operations

```bash
# Reset the database (drops volumes, then re-seed)
docker compose -f infra/docker-compose.dev.yml down -v
docker compose -f infra/docker-compose.dev.yml up -d
pnpm --filter @staffly/api prisma:migrate:deploy
pnpm --filter @staffly/api db:seed
pnpm --filter @staffly/api db:seed:dev

# Inspect the DB via Prisma Studio
pnpm --filter @staffly/api prisma:studio

# Tail infra logs
docker compose -f infra/docker-compose.dev.yml logs -f postgres
```

## Troubleshooting

- **`EADDRINUSE` on 3000/3001/4000** — another process is using the port. Find it with `lsof -i :3000` (or 3001/4000) and kill it.
- **Postgres won't connect** — confirm the container is healthy: `docker compose -f infra/docker-compose.dev.yml ps`. The host port is `5433`, not the default 5432.
- **Prisma client out of date** — `pnpm --filter @staffly/api prisma:generate`.
- **MinIO bucket missing** — the `minio-init` one-shot container creates `staffly-dev` on first boot. Re-run `docker compose -f infra/docker-compose.dev.yml up -d minio-init` if it's missing.
- **Auth fails immediately after seeding** — make sure `JWT_SECRET` in `apps/api/.env` is set (not the placeholder).
