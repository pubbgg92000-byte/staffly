# 08 — Technical Architecture

> **Status:** Phase 5. End-to-end system design. Describes the runtime topology, frontend/backend/DB architecture, auth, file storage, observability, security, performance, deployment, CI/CD, and the monorepo layout. References entities in `02`, endpoints in `03`, and design tokens in `04`.

---

## 1. High-Level System Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │              Browsers (web)                 │
                    │  Admin portal  +  Employee self-service     │
                    └─────────────────┬───────────────────────────┘
                                      │ HTTPS / cookies / Bearer
                  ┌───────────────────┴────────────────────┐
                  │            Next.js apps (15)           │
                  │     apps/admin    │   apps/employee    │
                  │  (App Router, RSC, TanStack Query)     │
                  └───────────┬───────┴────────┬───────────┘
                              │ /api/v1 (REST)
                              ▼
                  ┌───────────────────────────────────────┐
                  │           NestJS API (apps/api)       │
                  │  Modules: Auth, Org, RBAC, Employees, │
                  │  Attendance, Leave, Documents,        │
                  │  Announcements, Holidays, Dashboard,  │
                  │  Notifications, Files, Audit, Search  │
                  └──────┬────────┬───────────┬───────────┘
                         │        │           │
       ┌─────────────────┘        │           └─────────────────┐
       ▼                          ▼                             ▼
  ┌──────────┐             ┌────────────┐                ┌────────────┐
  │ Postgres │             │ Redis      │                │ S3-compat. │
  │ (Neon /  │             │ (Upstash / │                │ object     │
  │  RDS)    │             │  Elasticache)               │ storage    │
  └──────────┘             └─┬───────┬──┘                └────────────┘
                             │       │
                             │       └──── BullMQ workers (apps/api in
                             │             worker mode): emails, accruals,
                             │             reminders, digests, scheduled
                             │             announcements, attendance auto-close.
                             │
                             └──────► (cache) presigned URLs, hot dashboard data.

                  ┌──────────────────────────────────────────┐
                  │   External providers                     │
                  │   Postmark / SendGrid (email)            │
                  │   Sentry (errors)                        │
                  │   OpenTelemetry collector → vendor       │
                  └──────────────────────────────────────────┘
```

- The browser talks to the Next.js apps; the apps talk to the NestJS API via REST.
- The API talks to Postgres (writes + reads), Redis (cache + queues), and S3 (file storage).
- Workers run in the same codebase as the API but as separate processes, sharing the same Prisma client and DI container.

---

## 2. Repository Layout (Monorepo)

```
staffly/
├─ apps/
│  ├─ admin/                # Next.js 15 — Admin Portal
│  │  ├─ app/
│  │  │  ├─ (auth)/         # AuthLayout segment
│  │  │  ├─ (authed)/       # AdminLayout segment
│  │  │  ├─ api/            # Route handlers (only for cookie bridging if needed)
│  │  │  ├─ layout.tsx
│  │  │  └─ globals.css
│  │  ├─ public/
│  │  ├─ next.config.ts
│  │  └─ package.json
│  ├─ employee/             # Next.js 15 — Employee Portal (parallel structure)
│  └─ api/                  # NestJS 10
│     ├─ src/
│     │  ├─ main.ts
│     │  ├─ app.module.ts
│     │  ├─ common/         # filters, interceptors, pipes, decorators
│     │  ├─ infra/          # prisma, redis, mailer, storage, tracing, queues
│     │  ├─ tenant/         # TenantContext, TenantGuard, Prisma tenant extension
│     │  ├─ rbac/           # guards, permission resolver
│     │  ├─ modules/        # one per domain (auth, employees, leave, ...)
│     │  ├─ workers/        # BullMQ processors
│     │  └─ seeds/          # role-permissions.json, default leave types, ...
│     ├─ prisma/
│     │  ├─ schema.prisma
│     │  └─ migrations/
│     └─ package.json
├─ packages/
│  ├─ ui/                   # Shared shadcn-based design system (04)
│  │  ├─ src/
│  │  │  ├─ components/
│  │  │  ├─ styles/         # tokens.css, tailwind preset
│  │  │  └─ hooks/
│  │  └─ package.json
│  ├─ types/                # Zod schemas + TS types shared client↔server
│  │  ├─ src/
│  │  │  ├─ api/            # request/response shapes per module
│  │  │  ├─ forms/          # form schemas
│  │  │  └─ enums.ts
│  │  └─ package.json
│  ├─ config/               # eslint, tsconfig, tailwind preset, prettier
│  └─ i18n/                 # locale files; en.json
├─ docs/                    # Product, IA, database, API, UI, roadmap, architecture specs
├─ tooling/
│  ├─ docker-compose.dev.yml
│  ├─ k6/                   # load tests
│  └─ terraform/            # (optional, post-launch)
├─ .github/
│  └─ workflows/
│     ├─ ci.yml
│     └─ deploy.yml
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json
└─ README.md
```

### 2.1 Package boundaries

- `apps/admin` and `apps/employee` import from `packages/ui`, `packages/types`, `packages/i18n`, `packages/config`. They never import from `apps/api`.
- `apps/api` imports from `packages/types`, `packages/i18n` (template strings), `packages/config`. It never imports from the apps.
- `packages/types` is the **single source of truth** for request/response shapes. Both API validation pipes and client TanStack Query factories generate types from these Zod schemas.

---

## 3. Frontend Architecture

### 3.1 Routing & rendering strategy

- **App Router** in both portals.
- **Server Components** for read-mostly pages (lists, detail) — fetch initial state on the server, pass to client subtree.
- **Client Components** for interactive surfaces (forms, tables with filtering/sorting state).
- **Streaming** + `Suspense` to send shell first, hydrate widgets independently.
- **Loading & error boundaries:** every segment has `loading.tsx` and `error.tsx`.

### 3.2 Data fetching layer

- **TanStack Query v5** owns client cache.
- Query factories per domain live in `apps/<app>/src/data/<domain>.ts` and import shared types from `packages/types`.
- Query key convention: `[scope, domain, action, params]` e.g., `['admin', 'employees', 'list', filters]`.
- Mutations follow `useMutation` with optimistic updates where appropriate (see `05` cross-screen behaviors).
- Server components use a plain `apiServer` fetch helper that forwards cookies and the request id.

### 3.3 Auth flow on the client

- The Next.js apps run on a host that shares the cookie domain with the API (e.g., `*.peopleflow.app`).
- Cookies (`pf_access`, `pf_refresh`, `pf_csrf`) are HTTP-only Secure SameSite=Lax.
- Client mutations include `X-CSRF-Token` header from a non-HTTP-only `pf_csrf` cookie (sibling to the HTTP-only counterpart) — the double-submit cookie pattern.
- A `/auth/refresh` interceptor: when the API returns 401 `auth.token_expired`, the client transparently calls `POST /auth/refresh` and retries once. If refresh fails, the client clears local state and routes to sign-in.

### 3.4 Permission gating

- Server components inspect `/auth/me` (cached in React Server Component cache) and short-circuit to `/403` if the principal lacks the page's declared permission.
- Client components consume a `usePermissions()` hook (returns the array fetched by `/auth/me`) and gate UI affordances; the server is the source of truth — every action endpoint re-checks.

### 3.5 Layouts

| Layout | Where | Notes |
|---|---|---|
| `AuthLayout` | `app/(auth)/layout.tsx` | Centered card; brand mark. |
| `AdminLayout` | `apps/admin/app/(authed)/layout.tsx` | `<AppShell>` with admin nav. |
| `EmployeeLayout` | `apps/employee/app/(authed)/layout.tsx` | `<AppShell>` with employee nav; bottom-tab below `md`. |
| `OnboardingLayout` | `apps/admin/app/onboarding/layout.tsx` | `Stepper` header only. |

### 3.6 Forms

- `react-hook-form` + Zod schemas from `packages/types/forms`.
- A shared `useFormSchema(schema)` hook returns a typed `useForm` instance.
- Form components built on the `FormField` primitive from `packages/ui`.

### 3.7 Internationalization

- All UI strings flow through `t('key')` (a thin wrapper over `i18next` or `next-intl`).
- English-only Phase 1; locale picker hidden but `users.preferences.locale` exists.

### 3.8 Performance budgets per page

| Page bucket | LCP target | JS payload (gzip) |
|---|---|---|
| Auth pages | 1.0 s | < 60 kB |
| Dashboards | 1.5 s | < 220 kB |
| List pages | 1.8 s | < 250 kB |
| Detail/forms | 2.0 s | < 280 kB |

- Code-split per route via Next.js segments.
- Heavy components (Tiptap, Calendar) are lazy-loaded.
- Images served via `next/image`; SVG icons inlined via Lucide.

---

## 4. Backend Architecture

### 4.1 NestJS module map

One module per domain (mirrors the headings in `03`):

```
AppModule
├─ infra:    PrismaModule, RedisModule, MailerModule, StorageModule, QueueModule, TelemetryModule, ConfigModule
├─ tenant:   TenantModule (TenantContext, TenantGuard, Prisma extension)
├─ rbac:     RbacModule (PermissionsGuard, RolesGuard, ScopeResolver)
├─ AuthModule
├─ OrganizationModule
├─ EmployeesModule
├─ OrgStructureModule
├─ AttendanceModule
├─ LeaveModule
├─ DocumentsModule
├─ AnnouncementsModule
├─ HolidaysModule
├─ DashboardModule
├─ NotificationsModule
├─ FilesModule
├─ AuditModule
├─ SearchModule
└─ HealthModule
```

### 4.2 Cross-cutting concerns (in execution order per request)

1. **Helmet + CORS + body-size limits** at the platform layer.
2. **Rate limiter** middleware (Redis-backed, sliding window) — see `03 § 1.10`.
3. **RequestContext middleware** — generates `X-Request-Id` (or echoes incoming), starts a tracing span.
4. **JwtAuthGuard** — verifies access token from cookie or Authorization header; populates `req.user` with `{ user_id, organization_id, roles, permissions }`.
5. **TenantGuard** — pins `TenantContext = { organization_id }` on AsyncLocalStorage for downstream Prisma queries.
6. **PermissionsGuard** — checks declared `@RequirePermissions(...)` decorator against `req.user.permissions`; applies `ScopeResolver` to constrain `where` clauses.
7. **ValidationPipe (Zod)** — validates body, params, query against the Zod schema declared on the route.
8. **Controller handler** — orchestrates use cases; thin (no business rules).
9. **Service** — domain logic, idempotent where applicable.
10. **Repository (Prisma)** — automatically tenant-scoped via the Prisma extension.
11. **AuditInterceptor** — on state-changing routes, writes an `audit_logs` row with `before/after` diff (clones populated via `tx`).
12. **ResponseTransformInterceptor** — wraps response in `{ data, meta }` envelope.
13. **GlobalExceptionFilter** — maps `DomainException`, `ZodError`, `Prisma` errors to the envelope in `03 § 1.4`.

### 4.3 Prisma tenant extension

Every Prisma model has `organizationId`. The extension:

```
prisma.$extends({
  query: {
    $allModels: {
      async findMany({ args, query, model }) {
        if (TENANT_OPT_OUT.has(model)) return query(args)
        const orgId = currentTenantId()  // AsyncLocalStorage
        args.where = { AND: [{ organizationId: orgId }, args.where ?? {}] }
        return query(args)
      },
      async create({ args, query, model }) {
        if (TENANT_OPT_OUT.has(model)) return query(args)
        args.data = { ...args.data, organizationId: currentTenantId() }
        return query(args)
      },
      // ...findUnique, count, update, delete, upsert, aggregate all wrapped
    },
  },
})
```

- `TENANT_OPT_OUT` includes `Permission` (global catalog).
- A complementary check rejects any `where` containing an explicit different `organizationId` (`TenantBoundaryViolation`).
- For the **dedicated-DB tenancy tier**, the extension is replaced by a `PrismaClient` factory that selects a per-tenant connection string from a registry. Domain code is unchanged.

### 4.4 Background jobs (BullMQ)

Queues:

| Queue | Purpose | Trigger | Retention |
|---|---|---|---|
| `email` | Outbound transactional emails | API + scheduler | 7 days |
| `notifications.inapp` | Fan-out to `notifications` table | API events | 24 h |
| `leave.accrual` | Run accrual cron per period | Cron (`0 1 1 * *` etc.) | 90 days |
| `leave.expire` | Apply carry-forward caps and expire balances | Annual cron | 90 days |
| `attendance.autoclose` | Close incomplete attendance | Hourly cron | 30 days |
| `announcements.publish` | Publish scheduled announcements | Cron + at-time scheduled jobs | 30 days |
| `reminders.docs` | Pending acknowledgment reminders | Daily cron | 30 days |
| `digest.birthday` | Build daily birthday digest | Daily cron | 7 days |
| `cleanup.purge` | Hard-delete soft-deleted rows past grace | Nightly | 7 days |
| `import.employees` | Validate + commit bulk imports | API | 7 days |

Each processor is a Nest provider in `apps/api/src/workers/`. Workers run via `node dist/workers/main.js` as a separate process.

### 4.5 Domain services worth calling out

- `LeavePolicyEngine` — pure functions:
  - `computeRequestedUnits(request, workingDays, halfDayRules)`
  - `validatePolicy(request, leaveType, balance, employee)` → returns `Ok | DomainError[]`
  - `applyApproval(ledger, request)` → ledger entries
- `AttendanceComputeService` — given a record and policy, computes `worked_minutes`, `is_late`, `status`.
- `AudienceResolverService` — given an `Audience`, returns the employee id set. Used for preview, validation, and fan-out.
- `OrgBootstrapService` — seeds roles, permissions, default leave types, doc categories, attendance policy, holiday calendar on `POST /auth/sign-up`.

### 4.6 Idempotency

- `Idempotency-Key` (UUID) sniffed on POST. Stored in Redis (`idemp:<key>` → response hash + body) with 24h TTL.
- Returning the cached response with `Idempotency-Replayed: true` header.

---

## 5. Database Architecture

### 5.1 Engine & extensions

- **PostgreSQL 16** (managed: Neon or RDS).
- Extensions: `pg_uuidv7` (UUIDv7 PKs — time-sortable), `pg_trgm` (search), `pgcrypto` (random tokens, hashes), `btree_gist` (future overlap exclusion constraints), `unaccent` (search niceness).

### 5.2 Schema management

- Prisma migrations under `apps/api/prisma/migrations`.
- One migration per PR, paired with a brief rollback note in the PR description.
- **Expand → backfill → switch → drop** for non-trivial changes on multi-tenant tables.

### 5.3 Performance

- Composite indexes `(organization_id, …)` on every list-supporting predicate (see `02 § 5`).
- Trigram GIN indexes on name/title/email columns used by search.
- `attendance_records` partitioned by month (declarative) from day one to keep individual partitions small enough for fast vacuums and indexes.
- `audit_logs` partitioned by month once > 50M rows (trigger automation in cron when projection exceeds threshold).

### 5.4 Backups & PITR

- Managed Postgres feature (Neon / RDS): point-in-time recovery enabled with **24h PITR** (Phase 1).
- Logical daily dump uploaded to S3 cold storage (90-day retention).
- **Restore tested** monthly in staging (CI cron pulls a recent dump and restores into an ephemeral DB; smoke tests run).

### 5.5 Read replicas

- Phase 1: single primary.
- Phase 2: add read replica (managed); route admin reports + dashboards there via Prisma's `read` URL.

### 5.6 Tenant isolation

- Enforced **above the SQL layer** by the Prisma extension (§ 4.3).
- Defense in depth: a Postgres GUC (`app.org_id`) can be set per connection via a `SET LOCAL` at request start; a `BEFORE` trigger checks `organization_id` matches. This is opt-in for the most sensitive tables (`leave_*`, `employees`) initially, all tables eventually.
- The tenant test suite in `02 § 8` runs in CI.

### 5.7 Encryption

- At rest: managed-DB native encryption (AES-256).
- Sensitive columns also application-encrypted: `users.two_factor_secret_enc`, `two_factor_recovery_codes_enc` via AES-GCM keyed from `APP_DATA_ENC_KEY` (rotated annually).

---

## 6. Authentication & Authorization

### 6.1 Tokens

| Token | Lifetime | Storage | Notes |
|---|---|---|---|
| Access JWT | 15 min | HTTP-only secure cookie `pf_access` + memory mirror | Signed with HS256; payload `{ sub: userId, org_id, jti }`. |
| Refresh token | 7 days, rotating | HTTP-only secure cookie `pf_refresh` | Random 32 bytes; stored hashed in `refresh_tokens`. |
| CSRF token | 1 hour, rotating | Sibling cookie `pf_csrf` (non-HTTP-only) | Echoed in `X-CSRF-Token` header on state-changing requests. |

### 6.2 Sign-in flow

1. `POST /auth/sign-in` → validates creds.
2. If 2FA enabled → returns `two_factor_required` + short-lived `pf_2fa_challenge` cookie.
3. `POST /auth/two-factor/verify` → completes.
4. Server issues access + refresh tokens; persists `refresh_tokens` row with hashed token; sets cookies.

### 6.3 Refresh rotation

- Client calls `POST /auth/refresh` → server reads `pf_refresh`, looks up hash, ensures not revoked.
- New refresh issued; old one marked `revoked_at = now()` with `revoke_reason = 'rotated'`. Chain stored via `parent_id`.
- **Token reuse detection:** if a revoked token is reused (within grace ≤ 5 s), the entire chain is invalidated and a `tpl.security.token_reuse` notification is sent.

### 6.4 Authorization

- `JwtAuthGuard` populates `req.user`.
- `PermissionsGuard` is the only gatekeeper; checks `@RequirePermissions('leave.approve')` against `req.user.permissions`.
- `ScopeResolver` rewrites the query: for `self` scope it injects `employee_id = req.user.employee_id`; for `team` scope (Phase 2) it injects `manager_id IN (...)`.

### 6.5 2FA

- TOTP via `otplib`.
- 10 recovery codes generated on activation; stored encrypted; one-time use.

### 6.6 Password hashing

- argon2id, parallelism=2, memory=64MB, iterations=3.
- On password change, all refresh tokens for the user revoked.

### 6.7 Lockout

- After 10 failed sign-ins in 15 minutes per email, account is locked for 15 min (`users.locked_until`).
- The error response is identical to "bad credentials" until lockout — no enumeration.

### 6.8 Sessions overview

- Phase 1: only current session shown in `/profile/security`.
- Phase 2: full session list from `refresh_tokens` with revoke individual.

---

## 7. File Storage

### 7.1 Bucket layout

- One bucket: `peopleflow-prod-files`.
- Prefix per tenant: `org/<organization_id>/...`.
- Sub-prefixes per intent: `logos/`, `profile-photos/`, `documents/`, `announcements/`, `attachments/`, `imports/`, `exports/`.

### 7.2 Upload flow

1. Client calls `POST /files/presign-upload` with intent + name + mime + size.
2. Server validates mime/size against intent allowlist; generates an `uploads/<org>/<uuid>` key; returns a presigned PUT URL.
3. Client uploads directly to S3.
4. Client calls `POST /files/confirm-upload` with the key; server stats the object to confirm it exists, captures the real size, and returns a canonical `FileRef`.
5. The owning resource (document, announcement, attachment) is created with that `FileRef`.

### 7.3 Download flow

- Client requests `GET /files/:key/download`.
- Server runs ownership check (org match + RBAC) and returns a 10-minute presigned GET URL.

### 7.4 Orphan cleanup

- Daily job scans `uploads/` keys not referenced by any domain row and older than 24 h → deletes.

### 7.5 Mime/size limits

| Intent | Allowed mime | Max size |
|---|---|---|
| `logo` | `image/png`, `image/jpeg`, `image/svg+xml` | 2 MB |
| `profile_photo` | `image/png`, `image/jpeg`, `image/webp` | 4 MB |
| `document` | `application/pdf`, common Office, images | 25 MB |
| `announcement-image` | image/* | 10 MB |
| `attachment` (leave/reg) | pdf, images | 10 MB |
| `import` | `text/csv` | 25 MB |
| `export` (server-written) | `text/csv` | n/a |

### 7.6 Virus scanning

- Phase 1: out of scope.
- Phase 2: ClamAV side-car triggered on upload-confirm; quarantine and surface error.

---

## 8. Email & Notifications

### 8.1 Email

- Provider: **Postmark** (primary), SendGrid fallback (configurable).
- Templates rendered with `mjml` → HTML; subject + variables defined in `packages/types/notifications/templates.ts` (one template per id in `01 § 14`).
- Tracking opens/clicks: disabled in transactional emails to keep them lean.
- Bounce + complaint webhooks → mark email as bouncing on `users`; suspend further sends on `hard_bounce`; flag to admin.

### 8.2 In-app

- DB-backed `notifications` (`02 § 2.1.10`).
- Polling: clients call `/me/notifications?unread_only=true&limit=20` every 30 s.
- Toast on receipt of a `high`-priority notification while client is open.

### 8.3 Preferences

- Per template, per user toggle email/in-app (`02 § 2.1.11`).
- Org-level defaults can disable email entirely for a template (audited).

### 8.4 Digests

- `tpl.birthday`: daily digest assembled by `digest.birthday` job → posted in dashboard widget (no email by default).

---

## 9. Observability

### 9.1 Logging

- **pino** structured JSON.
- Required fields: `request_id`, `organization_id`, `user_id`, `route`, `latency_ms`, `status`.
- **Never log:** passwords, raw tokens, full file bytes, full PII payloads (mask email user-part to first char + suffix, mask phone to last 4 digits).
- Log levels: `info` (request/response summary), `warn` (recoverable), `error` (5xx), `debug` (gated by env).

### 9.2 Metrics

- Prometheus-style metrics endpoint (`/metrics`, network-restricted).
- Counters per route × status; histograms for latency (50/90/95/99); gauges for queue depth, worker concurrency.
- Business metrics: leave_requests_total{status=...}, attendance_check_ins_total, documents_acknowledged_total.

### 9.3 Tracing

- OpenTelemetry SDK auto-instruments NestJS, Prisma, BullMQ.
- Export OTLP to a vendor (Honeycomb / Tempo / Grafana Cloud).
- Trace id is propagated as `X-Trace-Id` (mirrors `X-Request-Id` when single-hop).

### 9.4 Error tracking

- **Sentry** for API + both Next.js apps.
- Release tags from CI; source-maps uploaded.
- PII scrubbing on by default.

### 9.5 Health endpoints

- `/healthz` returns 200 if the process is up.
- `/readyz` returns 200 only if DB, Redis, and a basic S3 head check pass.
- Used by load balancers and Kubernetes-style probes.

---

## 10. Security

### 10.1 OWASP Top-10 mitigations

| Risk | Mitigation |
|---|---|
| Injection | Prisma parameterized queries; never string-concat SQL. |
| Broken auth | JWT + rotation + lockout + 2FA + argon2id. |
| Sensitive data exposure | TLS everywhere; encrypted at rest; sensitive columns app-encrypted; no PII in logs. |
| XML external entities | Not used. |
| Broken access control | RBAC + tenant guard; default-deny; e2e tests. |
| Security misconfig | Helmet defaults; CSP; CI-baked secrets; least-privilege IAM. |
| XSS | React escapes; sanitize HTML on rich text input + output; CSP `script-src 'self'` only. |
| Insecure deserialization | Zod validation at every boundary. |
| Components with known vulns | Snyk + Dependabot. |
| Insufficient logging | Audit log + Sentry + structured request logs. |

### 10.2 Content Security Policy

- `default-src 'self'`.
- `img-src 'self' data: <s3 host>`.
- `connect-src 'self' <api host>`.
- `style-src 'self' 'unsafe-inline'` (Tailwind generates inline styles in dev only — production tightens).
- `frame-ancestors 'none'`.
- HSTS preload.

### 10.3 CSRF

- Double-submit token pattern with `pf_csrf` cookie + `X-CSRF-Token` header.
- Validated only on state-changing methods.
- Bearer-token API consumers (machine-to-machine, Phase 2) exempt.

### 10.4 SSRF

- All outbound HTTP from the API restricted to a known allowlist (Postmark, Sentry, OTLP, S3) via a fetch wrapper.
- File downloads accept only signed S3 URLs from our bucket.

### 10.5 Secrets

- Stored in the platform's secret manager (Doppler/Vault/Cloud Secrets).
- Never in environment files committed to git.
- Rotated annually; rotation playbook in `apps/api/docs/runbook.md`.

### 10.6 Audit dangerous endpoints

- `auth.*`, `rbac.*`, `org.settings.*`, `*delete*`, `*purge*` ALWAYS produce an `audit_logs` entry (even on failure when actor is known).

---

## 11. Performance

### 11.1 Budgets

- API p95 < 300 ms under 200 vCU at 10k employees in a tenant (target).
- Dashboard endpoints aim < 150 ms p95 (cached fragments where possible).
- Bulk endpoints (`/employees`) p95 < 800 ms.
- Background jobs: leave accrual 100k employees < 60 s.

### 11.2 Caching

- Redis caches:
  - `/auth/me` payload per user (TTL 60 s), invalidated on role/permission/profile change.
  - `/organization` and `/organization/settings` (TTL 5 min), invalidated on write.
  - Dashboard aggregates (TTL 30 s).
  - Audience-resolved employee id sets (TTL 30 s) for fan-out perf.
- HTTP cache headers: `Cache-Control: private, no-store` on authenticated responses (no shared caching); `public, max-age=3600` for assets only.

### 11.3 N+1 prevention

- Prisma `include` defined in repositories; integration tests assert query counts using `prisma.$on('query', ...)` snapshots.

### 11.4 Pagination defaults

- `page=1, limit=20` for offset endpoints.
- Cursor endpoints set sane initial limits (50 for audit logs, 20 for notifications).
- Hard cap `limit=100`.

### 11.5 CDN

- Static assets served by the host (Vercel) edge cache.
- Signed S3 URLs may use CloudFront/R2 edges (Phase 2).

---

## 12. Deployment

### 12.1 Topology

| Component | Suggested provider | Notes |
|---|---|---|
| Next.js apps (admin + employee) | Vercel | Edge runtime where compatible; node runtime for SSR with cookies. |
| NestJS API + workers | Fly.io / Render / Railway | 2+ instances behind load balancer; workers as separate process group. |
| Postgres | Neon / RDS | Managed; PITR on; daily logical backups → S3. |
| Redis | Upstash / Elasticache | TLS; persistence on. |
| Object storage | AWS S3 / Cloudflare R2 | Versioning on for documents bucket. |
| Email | Postmark | Set up SPF/DKIM/DMARC per tenant domain (optional Phase 2). |
| Errors | Sentry | Release tagging from CI. |
| Tracing | Honeycomb / Grafana Cloud | OTLP HTTP. |

### 12.2 Environments

| Env | Purpose | URL | Auto-deploy from |
|---|---|---|---|
| `dev` | Local | `localhost:3000` (apps), `:4000` (api) | n/a |
| `staging` | Internal QA | `staging.peopleflow.app` etc. | `main` (continuous) |
| `prod` | Customers | `peopleflow.app` etc. | tagged release |

### 12.3 Configuration

- 12-factor: env vars only; never commit secrets.
- Required env vars documented in `apps/api/.env.example`:
  - `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `APP_DATA_ENC_KEY`, `S3_*`, `POSTMARK_TOKEN`, `SENTRY_DSN`, `OTLP_ENDPOINT`, `BASE_URL_ADMIN`, `BASE_URL_EMPLOYEE`, `API_BASE_URL`.

---

## 13. CI/CD

GitHub Actions workflows:

### 13.1 `ci.yml` (every PR)

1. Set up Node + pnpm + Turborepo cache.
2. Lint (`pnpm lint`).
3. Type-check (`pnpm typecheck`).
4. Unit + integration tests (`pnpm test`).
5. Build all apps (`pnpm build`).
6. Storybook visual + axe check (`pnpm storybook:test`).
7. Playwright e2e against ephemeral docker-compose stack.
8. Coverage gate (per `07 § 5.1`).

### 13.2 `deploy.yml` (push to `main`)

1. `ci.yml` must be green.
2. Build images (api + workers).
3. Push to registry.
4. Run DB migrations against staging.
5. Deploy admin + employee to Vercel staging projects.
6. Deploy api + workers to Fly staging app.
7. Run smoke test suite (read-only) against staging.
8. On success → tag release; production deploy gated by manual approval.

### 13.3 Rollback

- Vercel: revert to previous deployment via dashboard or CLI.
- API: re-deploy previous image tag.
- DB: forward-only migrations; rollback uses the documented note (often a no-op or a compensating migration).

---

## 14. Local Development

`docker-compose.dev.yml` provides Postgres, Redis, Mailhog, MinIO (S3 emulation). Commands:

```
pnpm install
pnpm db:up         # docker compose up -d postgres redis mailhog minio
pnpm db:migrate    # prisma migrate dev
pnpm db:seed       # seed default org "Demo Inc" with sample data
pnpm dev           # turbo dev — runs admin + employee + api together
```

- Admin: `http://localhost:3000`
- Employee: `http://localhost:3001`
- API: `http://localhost:4000`

Storybook: `pnpm --filter @peopleflow/ui storybook`.

---

## 15. Future Architecture Considerations

| Topic | Direction |
|---|---|
| Search | Replace `pg_trgm` with **Meilisearch** when result quality plateaus; keep Postgres source of truth. |
| Outbound webhooks | Outbox pattern in API: writes a `domain_events` row in the same transaction; a worker drains to subscribers. Enables Zapier-style integrations. |
| WebSocket push | Replace polling for notifications with WS once concurrent connections matter. |
| Multi-region | Use Neon's read replicas + region-pinned tenants; complex but bounded. |
| Dedicated-DB tenancy tier | Per `00 § 8.2`. Tenant resolver picks `PrismaClient` from a registry keyed by `organization_id`. The domain code does not change. |
| Mobile apps | React Native sharing `packages/types`. Push notifications via FCM/APNs. |
| AI assist | Internal tooling first: smart search, drafted announcement text, leave anomaly detection. Privacy posture: never send PII to third-party LLMs without explicit consent. |
| SSO (SAML/OIDC) | Phase 3 Enterprise tier. `users.external_subject_id` column reserved. |
| Compliance: SOC 2 | Audit log + RBAC + encryption + backup verification are pre-requisites. Pursue formal audit at $5M ARR or first enterprise deal. |

---

## 16. Cross-reference Map

| Topic | Doc |
|---|---|
| Scope / personas / non-goals | `00` |
| Routes / nav / screens / RBAC / notifications / forms / flows | `01` |
| Entities, indexes, seeds | `02` |
| Endpoints, error codes, conventions | `03` |
| Design tokens, components, a11y | `04` |
| Admin screen specs | `05` |
| Employee screen specs | `06` |
| Sprint plan, DoD, testing, risks, expansion | `07` |
| System diagrams, FE/BE/DB/Sec/Obs/Perf/Deploy/CI | this doc |
