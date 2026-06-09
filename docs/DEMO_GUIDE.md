# Staffly — Demo Guide

A guided walkthrough for showing Staffly to stakeholders, pilot customers, or
investors. Assumes the dev stack is running and the demo data is seeded
(see [`docs/RUNBOOK.md`](RUNBOOK.md)).

## Before you start

```bash
docker compose -f infra/docker-compose.dev.yml up -d
pnpm --filter @staffly/api prisma:migrate:deploy
pnpm --filter @staffly/api db:seed
DEMO_SUPERADMIN_PASSWORD=... DEMO_HR_PASSWORD=... DEMO_MANAGER_PASSWORD=... \
  pnpm --filter @staffly/api db:seed:demo
pnpm dev
```

The seed prints the active demo credentials at the end. **Re-login if you
reseed** — reseeding rotates user IDs and invalidates open sessions.

## Demo login accounts

| Role | Email | Password | Portal |
| --- | --- | --- | --- |
| Super Admin | `superadmin@acme.demo` | `DEMO_SUPERADMIN_PASSWORD` | Admin (`:3000`) |
| HR Admin | `hr@acme.demo` | `DEMO_HR_PASSWORD` | Admin (`:3000`) |
| Manager | `manager@acme.demo` | `DEMO_MANAGER_PASSWORD` | Admin (`:3000`) |
| Employee | `employee@acme.demo` | `Employee@123` | Employee (`:3001`) |

Organization: **Acme Corporation** — 40 employees, 90 days of attendance,
leave/announcements/documents/notifications populated.

## Recommended demo flow (~10 min)

1. **Login as Super Admin** → `http://localhost:3000`.
2. **Review the dashboard** — 40 employees, ~32 present today, pending leave
   approvals, published announcements, upcoming holidays, attendance trend.
3. **Create an employee** — Employees → New. Save; the list updates.
4. **Approve a leave request** — Leave Requests → open a *pending* row →
   Approve. The pending count drops; the balance reflects it.
5. **Review attendance** — Attendance → filter by employee / date; open
   Regularizations to see the pending exception queue.
6. **Review announcements** — Announcements → see published + scheduled +
   draft, acknowledgement tracking.
7. **Switch to the Employee portal** → `http://localhost:3001`, login as
   `employee@acme.demo`.
8. **Check in** — the employee dashboard records today's check-in.
9. **Apply for leave** — pick a type + dates; it appears as pending for the
   admin to approve.
10. **Review dashboard updates** — balances and today's status reflect the
    actions above.

## Talking points

- **Multi-tenant** — every query is org-scoped automatically; the demo org is
  fully isolated from any other tenant.
- **RBAC** — four roles with distinct surfaces; managers see team data, not org
  administration; employees are self-service only.
- **Audit trail** — Settings → Audit Log (super admin) records mutations.
- **Branding** — Settings → Branding applies the org's primary color/logo.

## Resetting the demo

```bash
deploy/reset-demo.sh         # migrate → catalog seed → demo seed (idempotent)
```

Only the `staffly-demo` org is recreated; other tenants are untouched.

## Gotchas

- **"I don't see the data"** — confirm you're logged into `@acme.demo`
  (Acme Corporation), not the 4-employee `@staffly.local` dev org, and that
  your session is fresh (15-min access TTL; re-login after a reseed).
- **Don't run `pnpm build` while `pnpm dev` is running** — they share `.next`
  and the production build will corrupt the dev server. Stop dev first.
