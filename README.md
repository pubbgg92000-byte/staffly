# Staffly

Staffly is the working repository for **PeopleFlow**, a multi-tenant HRMS for SMBs.

## Status

**v0.12-ui-dashboard** — active development.

Twelve releases shipped across the backend sprint and UI foundation sprints:

| Tag                         | Milestone                                                       |
| --------------------------- | --------------------------------------------------------------- |
| `v0.1-infrastructure`       | Monorepo, CI, Docker Compose                                    |
| `v0.2-auth`                 | Auth + RBAC + multi-tenancy (JWT, refresh chain, org-bootstrap) |
| `v0.3-employee-management`  | Employee records + org structure                                |
| `v0.4-attendance`           | Attendance policies, check-in/out, regularization               |
| `v0.5-leave-management`     | Leave types, balances, requests, approvals                      |
| `v0.6-holidays`             | Holiday calendars + location assignment                         |
| `v0.7-announcements`        | Announcement composer, scheduling, ack tracking                 |
| `v0.8-documents-compliance` | Documents, versioning, MinIO, ack tracking                      |
| `v0.9-dashboards`           | `GET /dashboard/admin` + `GET /dashboard/employee` aggregations |
| `v0.10-ui-foundation`       | Shared UI package + auth/dashboard route scaffolds              |
| `v0.11-ui-auth`             | End-to-end authentication for both portals                      |
| `v0.12-ui-dashboard`        | Live dashboard widgets wired to API data                        |

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **API**: NestJS 10, Prisma 6, PostgreSQL 18, argon2id, JWT (HS256) + opaque-refresh chain
- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS, TanStack Query 5, react-hook-form + Zod
- **Storage**: MinIO (S3-compatible) for documents and files
- **Dev infra**: PostgreSQL 18, Redis, Mailhog, MinIO — all via Docker Compose

## Requirements

- Node.js 22+
- pnpm 11.5+
- Docker (OrbStack, Docker Desktop, or equivalent)

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Start dev infra (Postgres :5433, Redis :6379, Mailhog :8025, MinIO :9000)
docker compose -f infra/docker-compose.dev.yml up -d

# 3. Apply migrations and seed
pnpm --filter @staffly/api prisma:migrate:deploy
pnpm --filter @staffly/api db:seed          # catalog data (roles, permissions)
pnpm --filter @staffly/api db:seed:dev      # dev users (see table below)

# 4. Start all three servers concurrently
pnpm dev
```

| App             | URL                           |
| --------------- | ----------------------------- |
| Admin portal    | http://localhost:3000         |
| Employee portal | http://localhost:3001         |
| API             | http://localhost:4000         |
| API health      | http://localhost:4000/healthz |

### Dev seed users

| Role          | Email                      | Password       |
| ------------- | -------------------------- | -------------- |
| `super_admin` | `superadmin@staffly.local` | `Admin@123`    |
| `hr_admin`    | `hr@staffly.local`         | `HR@123`       |
| `manager`     | `manager@staffly.local`    | `Manager@123`  |
| `employee`    | `employee@staffly.local`   | `Employee@123` |

Admin portal accepts super_admin / hr_admin / manager. Employee portal accepts employee.

## Quality checks

```bash
pnpm typecheck    # tsc --noEmit across 7 packages
pnpm lint         # ESLint across the workspace
pnpm test         # Vitest unit tests
pnpm test:integration   # NestJS integration tests (requires running infra)
pnpm format:check # Prettier check
pnpm build        # Full Turborepo build
```

## Repository layout

```
apps/
  admin/      Next.js 15 — Admin portal (port 3000)
  employee/   Next.js 15 — Employee self-service portal (port 3001)
  api/        NestJS 10 — REST API (port 4000)
packages/
  ui/         Shared design system (shadcn/ui based)
  types/      Zod schemas + TypeScript types shared between client and server
  config/     tsconfig / Tailwind / ESLint / Prettier presets
  i18n/       Translation keys + locales
docs/         Architecture, design, and project state
infra/        Docker Compose dev stack
.github/      CI workflows
```

## Planning documents

| #   | Document                                                        |
| --- | --------------------------------------------------------------- |
| 00  | [Product overview](docs/00-product-overview.md)                 |
| 01  | [Information architecture](docs/01-information-architecture.md) |
| 02  | [Database design](docs/02-database-design.md)                   |
| 03  | [API specification](docs/03-api-specification.md)               |
| 04  | [Design system](docs/04-design-system.md)                       |
| 05  | [Admin portal](docs/05-admin-portal.md)                         |
| 06  | [Employee portal](docs/06-employee-portal.md)                   |
| 07  | [Development roadmap](docs/07-development-roadmap.md)           |
| 08  | [Technical architecture](docs/08-technical-architecture.md)     |

Current sprint state: [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md)

## License

Proprietary — all rights reserved. Internal use only until the license is set.
