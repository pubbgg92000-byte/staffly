# Staffly Demo and Architecture Handoff

This document is the single handoff guide for understanding, running, deploying,
and demonstrating Staffly. It is written for presenters, developers, operators,
and anyone taking over the demo without prior repository context.

## 1. Product overview

Staffly is a multi-tenant Human Resource Management System (HRMS) for small and
medium businesses. It provides two web portals backed by one REST API:

- **Admin portal** for super administrators, HR administrators, and managers.
- **Employee portal** for employee self-service.
- **API** for authentication, authorization, tenant isolation, business rules,
  persistence, auditing, notifications, and file operations.

The deterministic demo organization is **Acme Corporation**. Its seed contains
40 employees and 90 days of realistic attendance, leave, holiday,
announcement, document, notification, organization, and branding data.

## 2. Current public demo deployment

| Component       | Current URL                             | Platform   | Purpose                     |
| --------------- | --------------------------------------- | ---------- | --------------------------- |
| Admin portal    | `https://staffly-admin.vercel.app`      | Vercel     | HR and administration       |
| Employee portal | `https://staffly-employee.vercel.app`   | Vercel     | Employee self-service       |
| API             | `https://staffly-api-7jub.onrender.com` | Render     | REST API and authentication |
| Database        | Private connection                      | PostgreSQL | Tenant and business data    |

The two Next.js applications call the Render API directly over HTTPS. Browser
requests use `credentials: "include"`, allowing the browser to store and send
the API's authentication cookies.

```text
                         HTTPS + CORS + cookies
┌─────────────────────┐                         ┌─────────────────────┐
│ Admin portal        │────────────────────────▶│                     │
│ Next.js on Vercel   │                         │ NestJS API          │
└─────────────────────┘                         │ on Render           │
                                                │                     │
┌─────────────────────┐                         │ Auth, RBAC, tenant  │
│ Employee portal     │────────────────────────▶│ and business logic  │
│ Next.js on Vercel   │                         └──────────┬──────────┘
└─────────────────────┘                                    │
                                                           ▼
                                                ┌─────────────────────┐
                                                │ PostgreSQL          │
                                                └─────────────────────┘
```

### Current authentication behavior

The API issues three cookies:

| Cookie       | Visibility              | Purpose                       |
| ------------ | ----------------------- | ----------------------------- |
| `sf_access`  | HTTP-only               | Short-lived JWT access token  |
| `sf_refresh` | HTTP-only, `/auth` path | Refresh-token rotation        |
| `sf_csrf`    | JavaScript-readable     | Double-submit CSRF protection |

Production cookies use `Secure` and `SameSite=None` for the current cross-site
Vercel-to-Render demo.

The Admin portal protects its authenticated route group with a client-side
`SessionGate`. The gate calls `GET /auth/me`:

```text
Open an Admin protected route
            │
            ▼
SessionGate loads GET /auth/me with credentials
            │
            ├── 200: render the authenticated application
            ├── 401: redirect to /auth/sign-in?from=<original path>
            └── network/5xx: show a retry screen
```

This is deliberate for the current demo. A cookie created by
`staffly-api-7jub.onrender.com` is sent to the API but is not visible to
Next.js middleware running on `staffly-admin.vercel.app`. The API remains the
security boundary: every protected endpoint validates the token, tenant, and
permissions independently.

For state-changing requests, the portal obtains the double-submit token from
`GET /auth/csrf`. The browser sends the API-domain cookie to that endpoint and
the API returns its value only to origins permitted by `CORS_ORIGINS`. The
shared API client then supplies the value as `X-CSRF-Token`. This preserves
CSRF enforcement even though Vercel JavaScript cannot read Render cookies via
`document.cookie`.

Both portals use the same shared API-backed `SessionGate` implementation.

## 3. Intended production architecture

The preferred architecture gives every browser-facing service the same
registrable domain:

| Component       | Production host                   |
| --------------- | --------------------------------- |
| Employee portal | `https://staffly.av.online`       |
| Admin portal    | `https://admin.staffly.av.online` |
| API             | `https://api.staffly.av.online`   |

```text
staffly.av.online        ─┐
admin.staffly.av.online  ─┼── shared COOKIE_DOMAIN=.staffly.av.online
api.staffly.av.online    ─┘
```

Required frontend build variables:

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://api.staffly.av.online
NEXT_PUBLIC_ADMIN_BASE_URL=https://admin.staffly.av.online
NEXT_PUBLIC_EMPLOYEE_BASE_URL=https://staffly.av.online
```

Required API variables include:

```dotenv
NODE_ENV=production
COOKIE_DOMAIN=.staffly.av.online
CORS_ORIGINS=https://admin.staffly.av.online,https://staffly.av.online
APP_BASE_URL=https://admin.staffly.av.online
```

`NEXT_PUBLIC_*` variables are embedded during the Next.js build. Changing them
requires redeploying both frontend applications.

## 4. Repository architecture

Staffly is a pnpm workspace managed with Turborepo.

```text
staffly/
├── apps/
│   ├── admin/       Next.js Admin portal (local port 3000)
│   ├── employee/    Next.js Employee portal (local port 3001)
│   └── api/         NestJS REST API (local port 4000)
├── packages/
│   ├── ui/          Shared UI, layouts, API hooks, and auth forms
│   ├── types/       Shared TypeScript types and Zod contracts
│   ├── config/      ESLint, TypeScript, Tailwind, and Prettier presets
│   └── i18n/        Locale keys and translations
├── infra/           Local and production infrastructure configuration
├── deploy/          Release, backup, restore, and demo-reset scripts
├── docs/            Product, API, architecture, testing, and operations docs
└── .github/         CI workflows
```

### Applications

#### `apps/admin`

The administration portal contains:

- Dashboard and organization statistics.
- Employee creation, editing, offboarding, archive, and restore.
- Attendance records and regularization review.
- Leave requests, approvals, policies, and balances.
- Holiday calendars.
- Announcement authoring, scheduling, publishing, and acknowledgements.
- Document upload, versioning, audience assignment, and acknowledgements.
- Organization structure.
- Roles, permissions, users, and invitations.
- Organization profile and branding.
- Notifications and audit log.

#### `apps/employee`

The employee self-service portal contains:

- Personal dashboard.
- Check-in and check-out.
- Attendance history and regularization requests.
- Leave balances, requests, and request history.
- Holiday calendar.
- Announcement feed and acknowledgements.
- Documents and acknowledgements.
- Notifications.
- Personal organization and reporting-line view.

#### `apps/api`

The NestJS API is organized into domain modules:

- Authentication and token rotation.
- RBAC and permission scopes.
- Multi-tenant organization isolation.
- Employees and organization structure.
- Attendance and regularizations.
- Leave policies, balances, requests, and approvals.
- Holidays.
- Announcements.
- Documents and S3-compatible storage.
- Dashboards.
- Notifications.
- Organization settings and branding.
- Audit logs.
- Health and readiness checks.

### Shared packages

| Package           | Responsibility                                                                    |
| ----------------- | --------------------------------------------------------------------------------- |
| `@staffly/ui`     | Design system, layouts, forms, TanStack Query hooks, API client, session handling |
| `@staffly/types`  | Shared request/response contracts, enums, form types, and Zod validation schemas  |
| `@staffly/config` | Shared lint, formatting, TypeScript, and Tailwind configuration                   |
| `@staffly/i18n`   | Translation keys and locale resources                                             |

The frontend applications never import API implementation code. They share
contracts through `@staffly/types` and access the backend through the REST API.

## 5. Technology stack

| Layer          | Technology                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Monorepo       | pnpm workspaces, Turborepo                                                  |
| Frontend       | Next.js 15 App Router, React 19, TypeScript                                 |
| UI             | Tailwind CSS, Radix/shadcn-style primitives, Lucide icons                   |
| Client data    | TanStack Query 5                                                            |
| Forms          | react-hook-form and Zod                                                     |
| Backend        | NestJS 10, TypeScript, Express adapter                                      |
| ORM            | Prisma 6                                                                    |
| Database       | PostgreSQL 18-compatible schema                                             |
| Authentication | argon2id passwords, JWT access token, rotating refresh tokens               |
| Storage        | S3-compatible object storage; MinIO locally, R2/S3-compatible in deployment |
| Email          | Log/Mailhog locally; SMTP, Resend, or Mailgun in production                 |
| Monitoring     | Sentry integration for API, Admin, and Employee applications                |
| Hosting        | Vercel frontends, Render API for the current demo                           |

## 6. Security and tenancy model

- Every authenticated request resolves a user and organization.
- Tenant-owned data is scoped by `organizationId` through the Prisma tenant
  extension and explicit service-level checks where required.
- API endpoints enforce permissions; hiding a button in the UI is not treated
  as authorization.
- `super_admin` receives the full permission set.
- HR, manager, and employee roles receive narrower permission and data scopes.
- Mutations performed with cookies use double-submit CSRF protection.
- Passwords are hashed with argon2id.
- Refresh tokens rotate and can be revoked.
- State-changing operations are recorded in the audit log where supported.
- Helmet, CORS, validation, throttling, and global error handling are applied by
  the API.

## 7. Demo accounts

| Role        | Email                  | Password source                                           | Portal   |
| ----------- | ---------------------- | --------------------------------------------------------- | -------- |
| Super Admin | `superadmin@acme.demo` | `DEMO_SUPERADMIN_PASSWORD`                                | Admin    |
| HR Admin    | `hr@acme.demo`         | `DEMO_HR_PASSWORD`                                        | Admin    |
| Manager     | `manager@acme.demo`    | `DEMO_MANAGER_PASSWORD`                                   | Admin    |
| Employee    | `employee@acme.demo`   | `DEMO_EMPLOYEE_PASSWORD`; local convention `Employee@123` | Employee |

Never commit public Admin, HR, or Manager passwords. The demo seed reads them
from environment variables and prints the active values during seeding.

## 8. Presenter preflight

Complete this checklist before sharing the demo:

1. Open the API health endpoint and confirm a successful response.
2. Open both portals in a private browser window.
3. Sign in as Super Admin and confirm `/auth/me` returns `200`.
4. Open Dashboard, Employees, Attendance, Leave, Announcements, and Documents.
5. Sign in as Employee in a separate private profile.
6. Confirm check-in status, leave balances, announcements, and documents load.
7. Keep Admin and Employee credentials in a private presenter note.
8. Avoid reseeding during a live presentation; reseeding invalidates sessions.

For the current public demo, check:

```text
https://staffly-api-7jub.onrender.com/healthz
https://staffly-admin.vercel.app
https://staffly-employee.vercel.app
```

Render may cold-start after inactivity. Open the health endpoint several
minutes before the presentation.

## 9. Recommended 10-minute demo

### Admin story

1. Sign in as `superadmin@acme.demo`.
2. Show dashboard headcount, attendance, leave, holidays, and announcements.
3. Open Employees and show filtering and an employee profile.
4. Create or edit an employee to demonstrate validated HR workflows.
5. Open Attendance and review a regularization request.
6. Open Leave Requests and approve one pending request.
7. Show Announcements, Documents, Organization, Branding, Roles, and Audit Log.

### Employee story

1. Sign in as `employee@acme.demo`.
2. Show the employee dashboard and current attendance state.
3. Check in or show today's recorded check-in.
4. Submit a leave request.
5. Read an announcement and acknowledge a document.
6. Return to Admin and show the corresponding request or updated state.

### Suggested talking points

- One platform supports HR administration and employee self-service.
- Every tenant is isolated at the API and database access layers.
- RBAC changes both visible features and backend authorization.
- The deterministic dataset makes every major feature presentable immediately.
- Audit logs and notifications connect business actions across the system.

## 10. Local setup

### Requirements

- Node.js 22 or newer.
- pnpm 11.5 or newer.
- Docker through OrbStack, Docker Desktop, Colima, or equivalent.

### Start locally

```bash
pnpm install
docker compose -f infra/docker-compose.dev.yml up -d
pnpm --filter @staffly/api prisma:migrate:deploy
pnpm --filter @staffly/api db:seed
pnpm --filter @staffly/api db:seed:demo
pnpm dev
```

Local endpoints:

| Service       | URL                             |
| ------------- | ------------------------------- |
| Admin         | `http://localhost:3000`         |
| Employee      | `http://localhost:3001`         |
| API           | `http://localhost:4000`         |
| Health        | `http://localhost:4000/healthz` |
| Mailhog       | `http://localhost:8025`         |
| MinIO console | `http://localhost:9001`         |

Set private demo passwords explicitly when preparing a shared environment:

```bash
DEMO_SUPERADMIN_PASSWORD='...' \
DEMO_HR_PASSWORD='...' \
DEMO_MANAGER_PASSWORD='...' \
DEMO_EMPLOYEE_PASSWORD='...' \
pnpm --filter @staffly/api db:seed:demo
```

## 11. Resetting demo data

The deployment reset script applies migrations, seeds the catalog, and
recreates the deterministic demo organization:

```bash
deploy/reset-demo.sh
```

The script is designed to recreate only the `staffly-demo` organization. It
does not intentionally remove other tenants. Nevertheless, treat every reset
as a state-changing production operation: verify the database target and take
a backup first. All existing demo sessions must sign in again afterward.

## 12. Environment variables

Do not commit real values. Use platform secrets for production and local `.env`
files for development.

### API essentials

| Variable               | Purpose                               |
| ---------------------- | ------------------------------------- |
| `NODE_ENV`             | Runtime mode                          |
| `PORT`                 | API listening port                    |
| `DATABASE_URL`         | PostgreSQL connection string          |
| `JWT_SECRET`           | Access-token signing secret           |
| `COOKIE_DOMAIN`        | Browser cookie scope                  |
| `CORS_ORIGINS`         | Allowed portal origins                |
| `APP_BASE_URL`         | Admin URL used in generated links     |
| `S3_ENDPOINT`          | S3-compatible endpoint                |
| `S3_REGION`            | Storage region                        |
| `S3_BUCKET`            | Storage bucket                        |
| `S3_ACCESS_KEY_ID`     | Storage access key                    |
| `S3_SECRET_ACCESS_KEY` | Storage secret                        |
| `EMAIL_PROVIDER`       | `log`, `smtp`, `resend`, or `mailgun` |
| `EMAIL_FROM`           | Sender identity                       |
| `SENTRY_DSN`           | API error monitoring                  |

### Frontend essentials

| Variable                        | Purpose                    |
| ------------------------------- | -------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`      | Browser-visible API origin |
| `NEXT_PUBLIC_ADMIN_BASE_URL`    | Admin portal origin        |
| `NEXT_PUBLIC_EMPLOYEE_BASE_URL` | Employee portal origin     |
| `NEXT_PUBLIC_SENTRY_DSN`        | Frontend error monitoring  |

## 13. Quality checks

Run from the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm --filter @staffly/api test:integration
pnpm build
```

Do not run `next build` while `next dev` is using the same application's
`.next` directory. Stop the development server before building.

## 14. Troubleshooting

### Login succeeds but returns to sign-in

Check the sequence in browser DevTools:

1. `POST /auth/signin` should return `200`.
2. The response should set `sf_access`, `sf_refresh`, and `sf_csrf`.
3. `GET /auth/me` should include credentials and return `200`.
4. `GET /auth/csrf` should return a token before an authenticated mutation.
5. On split `*.vercel.app` and `*.onrender.com` domains, portal middleware
   cannot read the API-domain cookie. Both portals therefore use the shared
   API-backed `SessionGate`; the preferred production solution remains the
   shared `staffly.av.online` domain.

### `/auth/me` returns `401`

- Confirm the browser stored the API cookies.
- Confirm API requests use `credentials: "include"`.
- Confirm `Secure` and `SameSite` match the deployment.
- Confirm access and refresh tokens use the same active `JWT_SECRET`.
- Clear stale cookies after changing `COOKIE_DOMAIN`.

### Browser reports a CORS failure

- Add the exact portal origin to `CORS_ORIGINS`.
- Do not use `*` when credentials are enabled.
- Confirm `Access-Control-Allow-Credentials: true`.
- Redeploy the API after environment changes.

### UI loads but data is missing

- Confirm the signed-in organization is **Acme Corporation**.
- Confirm the account ends in `@acme.demo` rather than `@staffly.local`.
- Check the actual API response and active filters.
- Re-login after reseeding.

### A Vercel environment change appears ineffective

`NEXT_PUBLIC_*` values are build-time values. Redeploy the portal after
changing them.

### Render is initially slow

The service may be cold-starting. Open `/healthz` before the demo and wait for
a successful response before signing in.

## 15. Operational handoff checklist

- [ ] Record the current Git commit and deployment IDs.
- [ ] Confirm Admin, Employee, API, and database health.
- [ ] Confirm CORS origins and frontend API URL match.
- [ ] Confirm cookies work in a clean browser profile.
- [ ] Verify all four demo roles.
- [ ] Keep privileged credentials outside Git and presentation materials.
- [ ] Confirm object uploads and downloads if Documents will be demonstrated.
- [ ] Confirm email delivery if invitations or password reset will be shown.
- [ ] Take a database backup before resetting demo data.
- [ ] Keep a rollback deployment available in Vercel and Render.

## 16. Detailed reference documents

- [Root project README](README.md)
- [Guided demo script](docs/DEMO_GUIDE.md)
- [Technical architecture](docs/08-technical-architecture.md)
- [API specification](docs/03-api-specification.md)
- [Database design](docs/02-database-design.md)
- [Admin portal specification](docs/05-admin-portal.md)
- [Employee portal specification](docs/06-employee-portal.md)
- [Deployment runbook](docs/DEPLOYMENT.md)
- [Deployment checklist](docs/DEPLOY_CHECKLIST.md)
- [Operations runbook](docs/RUNBOOK.md)
- [Testing guide](docs/TESTING.md)
- [Production signoff](docs/PRODUCTION_SIGNOFF.md)
