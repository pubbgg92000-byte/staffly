# Staffly — Demo Script (Indian profile)

A scripted walkthrough for investor / customer / HR stakeholders, written
against the India demo profile (`DEMO_PROFILE=india`). The tenant is **Bharat
Tech Solutions Pvt Ltd** — an Indian SMB on Asia/Kolkata, INR, en-IN, with six
Indian offices (Bengaluru HQ, Mumbai, Hyderabad, Delhi NCR, Chennai, Remote),
the standard Indian public-holiday set, and 40 employees with a manager
hierarchy. Demo guide for the default US profile (Acme Corporation) lives in
[`DEMO_GUIDE.md`](DEMO_GUIDE.md) — same product, different flavor.

Three audiences, three flows: skip what's not relevant.

## Pre-flight

```bash
# 1. Infra up
docker compose -f infra/docker-compose.dev.yml up -d
pnpm --filter @staffly/api prisma:migrate:deploy
pnpm --filter @staffly/api db:seed          # permission catalog (idempotent)

# 2. Seed the India profile (pinned org id stays the same as the US profile)
DEMO_PROFILE=india \
  DEMO_SUPERADMIN_PASSWORD=... DEMO_HR_PASSWORD=... DEMO_MANAGER_PASSWORD=... \
  pnpm --filter @staffly/api db:seed:demo

# 3. Servers
pnpm dev   # admin :3000, employee :3001, api :4000
```

The seed prints the four demo credentials at the end. **Re-login after a
reseed** — reseeding rotates user IDs and invalidates open sessions.

## Demo accounts

| Role | Email | Password | Portal |
| --- | --- | --- | --- |
| Super Admin | `superadmin@bharattech.demo` | `DEMO_SUPERADMIN_PASSWORD` | Admin (`:3000`) |
| HR Admin | `hr@bharattech.demo` | `DEMO_HR_PASSWORD` | Admin (`:3000`) |
| Manager | `manager@bharattech.demo` | `DEMO_MANAGER_PASSWORD` | Admin (`:3000`) |
| Employee | `employee@bharattech.demo` | `Employee@123` | Employee (`:3001`) |

People behind the seats (fixed by the profile, useful when you want to call
out who is who on screen): **Aarav Sharma** (super admin), **Priya Reddy** (HR
admin, Senior Manager — HR), **Vikram Iyer** (engineering manager, 6 direct
reports), **Anjali Patel** (Software Engineer — Engineering).

Dataset snapshot the script assumes: 40 employees · 90 days of attendance
through today · 8 announcements (5 published incl. pinned, 1 scheduled, 1
draft) · 14 pending leave requests + 35 approved + 7 rejected + 12 cancelled ·
6 pending attendance regularizations · 8 org-wide documents (3 required) +
personal documents on ~30 % of employees · Diwali, Independence Day, Holi,
Ugadi, Ram Navami, Ganesh Chaturthi, Dussehra, Republic Day, New Year,
Christmas on the holiday calendar.

## A — Investor flow (~10 min)

Goal: prove **product breadth** and **multi-tenant production-readiness** in
one sweep. Skip the "click every field" detail; lean on the dashboards.

1. **Login as Super Admin → admin portal.** Open the **Dashboard**.
   - Call out: 40 employees, ~31 present today (out of 40), pending leave
     queue, today's check-ins trending live, upcoming holidays (Independence
     Day, Ganesh Chaturthi, Diwali — whichever is closest), recent
     announcements pinned on top.
   - Talking point: "every number on this page is computed in the org's
     timezone — Bharat Tech is Asia/Kolkata, Acme Corporation in the
     [US profile](DEMO_GUIDE.md) is America/New_York; you can swap by
     re-seeding `DEMO_PROFILE`. Same product, same code, different tenant."
2. **Sidebar → Branding (Settings → Branding).** Show the saffron primary
   color (`#FF6F00`) flowing through every page, the org name surfaced in the
   top bar. Toggle to a different color in real time — the live UI updates
   without a reload.
3. **Sidebar → Holidays.** Calendar shows the 10 Indian public holidays for
   the current year (Republic Day, Holi, Ugadi, Ram Navami, Independence Day,
   Ganesh Chaturthi, Dussehra, Diwali, Christmas, New Year).
   - Talking point: "holiday calendars are per-location — Mumbai and Chennai
     could each carry a regional calendar on top of the public set. The
     attendance engine skips holidays automatically."
4. **Sidebar → Employees.** 40 rows, six locations, eight departments,
   manager column populated, search + filters.
5. **Sidebar → Leave Requests.** Show the pending queue (14 rows). Hover a
   row — pending dates, employee, balance impact preview.
6. **Sidebar → Audit Log (super-admin only).** Demonstrates the compliance
   posture. Filter by resource/actor/date.
7. Close with: "this is one tenant; the multi-tenant infrastructure isolates
   each org at the database row level — no shared rows ever leave a tenant.
   We've benchmarked at 5 000 employees in scratch tenants and dashboard p95
   stays under 50 ms; performance evidence is in
   [`PERFORMANCE_REPORT.md`](PERFORMANCE_REPORT.md)."

## B — Customer / HR flow (~15 min)

Goal: prove **real hands-on use** for an HR admin. Sit on a single role
(HR Admin) and walk a realistic morning.

1. **Login as HR Admin → admin portal.** Dashboard renders with the same
   metrics as super admin minus the audit panel.
2. **Onboard a new joiner.** Sidebar → Employees → **New**. Fill out:
   first/last name (use an Indian name from the pool — Aanya, Priya, Karthik,
   etc.), employee code (auto-suggested), department (Engineering),
   designation (Software Engineer), location (Bengaluru HQ — `Asia/Kolkata`),
   joining date today.
   - Save. The list page updates without a refresh; the new row appears at
     the top with today's joining date and "active" status.
   - Open the new employee's detail page → confirm department head + manager
     chain populated; the dashboard "New joins this month" tile bumped by 1.
3. **Approve a leave request.** Sidebar → Leave Requests → filter by status
   pending → open a row.
   - The approval pane shows the employee's current balance (allocated /
     used / pending) for that leave type, the request's start/end, units,
     reason. Approve.
   - The pending count drops; the employee's balance reflects the change; an
     in-app notification fans out to the requester.
   - Talking point: "managers can approve **and** reject for their team —
     `leave.reject` is granted to the manager role at team scope, enforced
     row-level. We'll see that in the manager flow."
4. **Triage an attendance regularization.** Sidebar → Attendance →
   Regularizations. Six pending rows for the demo.
   - Open one — original record, requested check-in / check-out, employee's
     reason ("Forgot to check in — was on a client call.").
   - Approve. The attendance record on that date updates; the regularization
     count drops.
5. **Publish an announcement.** Sidebar → Announcements → Compose.
   - Title: "Diwali bonus payout — November 2"; body: a short paragraph;
     pin: yes; require ack: yes; audience: all employees. Publish.
   - Notifications fan out; the announcement lands pinned at the top of
     every employee's feed.
6. **Upload a document.** Sidebar → Documents → New Document → category
   "HR Policies" → upload a PDF (presigned PUT to MinIO/R2 → confirm) →
   audience all employees → require ack.
   - Talking point: "tenant-scoped storage keys — every upload is namespaced
     under `uploads/<orgId>/…` and the API rejects any key that doesn't
     match the caller's tenant. No cross-tenant object access."
7. **Settings → Organization.** Show the org profile: legal name "Bharat
   Tech Solutions Private Limited", domain, timezone, locale `en-IN`,
   currency INR, week-start Monday, billing email.

## C — Manager flow (~3 min, add-on)

Goal: prove **team scoping** is real (not just an org-wide read with the UI
hiding rows).

1. Logout → login as **Manager** (`manager@bharattech.demo`).
2. Sidebar shows Dashboard / Employees / Attendance / Leave / Announcements /
   Holidays only — no Org Structure / Documents / Settings / Audit.
3. Employees page shows only Vikram Iyer's six direct reports (not the full
   40). Try the URL trick: open a non-team employee's id directly →
   `/employees/<other-id>` → 404 (server-enforced via `CallerScopeService`).
4. Leave Requests shows only requests from the manager's team. Open one →
   approve or **reject** → counts update.

## D — Employee self-service (~3 min, add-on)

1. Open `:3001` → login as `employee@bharattech.demo`.
2. Dashboard → today's status, this week's hours, leave balance, recent
   announcements.
3. Click **Check In** — captures the local-tz check-in (Asia/Kolkata); the
   admin dashboard's "Today's attendance" tile bumps by one.
4. Sidebar → Leave → **Apply** → pick "Casual Leave", date range, reason.
   Submit. Shows up immediately in the HR admin's pending queue.
5. Sidebar → Documents — see the org-wide handbook + policies, plus any
   personal documents (offer letter, PAN card, etc.) assigned to this
   employee.

## Talking points (drop in anywhere)

- **Multi-tenant by construction.** Every Prisma query is org-scoped via a
  client extension; the `organization_id` filter is unforgeable from
  application code. Manager team-scoping is row-level on top of that.
- **Indian-flavored out of the box.** Leave types match the Indian SMB
  convention (Casual / Sick / Earned / Work From Home / Loss of Pay).
  Attendance policy is 9-to-6 with weekday work-days, holidays automatic.
  INR currency, en-IN locale, Asia/Kolkata timezone — set at the org row
  and threaded through every dashboard query.
- **Same code, different demo.** Re-seeding with `DEMO_PROFILE=us` re-creates
  the same pinned org as Acme Corporation (US, USD, en-US) without any code
  change. Useful for showing US prospects exactly the same product against
  exactly the same codebase.
- **Production-readiness audit.** Branch `feat/v0.23.2-prod-readiness`
  carries the full v1.0 certification (17 phases — auth, RBAC, attendance,
  leave, documents, notifications, email, dashboards, security,
  performance, deployment, UX, docs, multi-region). Reports live in
  [`docs/certification/`](certification/); production go/no-go in
  [`PRODUCTION_SIGNOFF.md`](PRODUCTION_SIGNOFF.md).

## Resetting between runs

```bash
# Re-seed the India tenant (idempotent; only touches staffly-demo)
DEMO_PROFILE=india deploy/reset-demo.sh

# Switch back to the US profile
DEMO_PROFILE=us deploy/reset-demo.sh
```

Both runs hit the SAME pinned org id; the slug stays `staffly-demo`. No
schema changes either way. Other tenants (`staffly-dev`) are never touched.

## Known limitations during the script

- **Lunar holiday dates** (Holi, Diwali, Dussehra, Ganesh Chaturthi, Ram
  Navami, Ugadi) are pinned to **2026 Gregorian** in the India profile. If
  you demo against a future year, expect those dates to drift by a few days
  — refresh `apps/api/prisma/demo-profiles/india.ts` annually.
- **Email send** is wired to log/SMTP/Resend/Mailgun behind `EMAIL_PROVIDER`
  (Mailhog is the local dev sink). The provider abstraction is live, but
  Resend/Mailgun live sends need real credentials at deploy time — they're
  not exercised in the script.
- **Browser visual review** (mobile viewports, screen-reader paths, exact
  contrast) is out of scope for this walkthrough; see
  [`docs/certification/UX_REVIEW.md`](certification/UX_REVIEW.md).
