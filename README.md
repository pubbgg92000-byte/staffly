# Staffly

Staffly is the working repository for **PeopleFlow**, a multi-tenant HRMS for SMBs.

## Status

Sprint 0 is in progress. The repo is intentionally foundation-only:

- Monorepo scaffolding (pnpm workspaces + Turborepo)
- Next.js admin shell (`apps/admin`, port 3000)
- Next.js employee shell (`apps/employee`, port 3001)
- NestJS API foundation (`apps/api`, port 4000)
- PostgreSQL + Prisma foundation
- Auth and RBAC skeletons
- Shared UI / types / config / i18n packages

Feature modules — employee CRUD, attendance, leave, documents, announcements, holidays — begin **after** the foundation is stable. The roadmap lives in [`docs/07-development-roadmap.md`](docs/07-development-roadmap.md).

## Planning documents

All architectural decisions are written down before code. See [`docs/`](docs/):

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

## Requirements

- Node.js 22+
- pnpm 11.5+
- Docker (for the dev stack — Postgres, Redis, Mailhog, MinIO; arrives in Sprint 0 Batch 2)

## Quick start

```bash
pnpm install
pnpm check       # lint + typecheck across the monorepo
pnpm build       # turbo build
pnpm dev         # runs admin + employee + api in parallel
```

After Sprint 0 Batch 2 lands, you'll also run:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
pnpm --filter @staffly/api prisma migrate dev
```

## Repository layout

```
apps/
  admin/      Next.js 15 — Admin portal
  employee/   Next.js 15 — Employee self-service
  api/        NestJS 10 — REST API + workers
packages/
  ui/         Shared design system (shadcn/ui based)
  types/      Zod schemas + TypeScript types shared client/server
  config/     tsconfig / tailwind / eslint / prettier presets
  i18n/       Translation keys + locales
docs/         Architecture and planning
infra/        Docker Compose, k6 (post-launch)
.github/      CI workflows
```

## License

Proprietary — all rights reserved. Internal use only until the license is set.
