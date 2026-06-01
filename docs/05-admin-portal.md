# 05 — Admin Portal: Screen-by-Screen Specification

> **Status:** Phase 4. One section per screen ID declared in `01 § 9.1`. Each section lists purpose, route, layout, permissions, data dependencies (endpoints from `03`), composition (components from `04`), actions, forms with full validation, states, and notable behaviors.
>
> Conventions:
> - **API refs** use the exact paths declared in `03-api-specification.md`.
> - **Components** are PascalCase and refer to `04-design-system.md § 6`.
> - **Permissions** use the keys from `01 § 10.2`.
> - **Widget IDs** are from `01 § 12`.

---

## A-AUTH-001 — Sign In

- **Route:** `/auth/sign-in` · **Layout:** `AuthLayout` · **Permission:** public.
- **APIs:** `POST /auth/sign-in`, `POST /auth/two-factor/verify` (if challenged).
- **Composition:** centered `Card` with logo, two `FormField`s, primary `Button`, link to forgot-password.
- **Form: sign-in**

  | Field | Type | Validation | Notes |
  |---|---|---|---|
  | `email` | email | required, RFC, ≤ 254 | autofocus |
  | `password` | password | required, ≥ 1 char (no leak about rules) | "Show" toggle |

- **Actions:** Sign in. Secondary link: "Forgot password?".
- **States:**
  - **Invalid creds**: inline banner "We couldn't sign you in. Check your email or password."
  - **Locked**: "Your account is temporarily locked. Try again in 15 minutes."
  - **2FA required**: full-page transition into 2FA screen (`A-AUTH-004`).
- **Empty state:** n/a.
- **Telemetry:** count failed attempts; never log password.

---

## A-AUTH-002 — Forgot Password

- **Route:** `/auth/forgot-password` · **Layout:** `AuthLayout` · **Permission:** public.
- **APIs:** `POST /auth/forgot-password`.
- **Form:** single `email` field.
- **Behavior:** always shows success screen ("If an account exists for this email, you'll receive a reset link.") to prevent enumeration.

---

## A-AUTH-003 — Reset Password

- **Route:** `/auth/reset-password?token=…` · **Layout:** `AuthLayout` · **Permission:** public (token).
- **APIs:** `POST /auth/reset-password`.
- **Form:**

  | Field | Validation |
  |---|---|
  | `new_password` | min 10, ≥ 1 letter & digit, zxcvbn ≥ 3; strength meter visible. |
  | `confirm_password` | must match. |

- **Token invalid/expired:** error card with CTA to request a new link.
- **Success:** "Password updated. Sign in to continue." → link to sign-in.

---

## A-AUTH-004 — Two-Factor

- **Route:** `/auth/two-factor` · **Layout:** `AuthLayout` · **Permission:** post-login challenge.
- **APIs:** `POST /auth/two-factor/verify`.
- **Form:** 6-digit `code` (`Input` with `inputmode=numeric`, auto-advance digits; paste-supported).
- **Secondary CTA:** "Use recovery code" — switches input to multi-line code.
- **Errors:** "That code didn't match. Try again." Max 5 attempts → revert to sign-in.

---

## A-AUTH-005 — Accept Invite

- **Route:** `/auth/accept-invite?token=…` · **Layout:** `AuthLayout` · **Permission:** public (token).
- **APIs:** `GET /auth/invite/:token` (peek), `POST /auth/invite/accept`.
- **Composition:** confirmation card "Welcome, {first_name}. Set a password to join {org}." then the form.
- **Form:**

  | Field | Validation |
  |---|---|
  | `first_name` | required, prefilled from invite. |
  | `last_name` | required, prefilled from invite. |
  | `password` | as A-AUTH-003. |

- **Post-success:** option to enable 2FA → routes to `/auth/2fa` setup; else `/dashboard`.

---

## A-ONB-001 — Onboarding Wizard

- **Route:** `/onboarding` · **Layout:** `OnboardingLayout` · **Permission:** `org.setup`.
- **APIs:**
  - Step 1: `PATCH /organization`.
  - Step 2: `POST /policies/attendance` → `set-default`.
  - Step 3: `POST /leave-types` (pre-seeded; user edits).
  - Step 4: `POST /holiday-calendars` + import CSV.
  - Step 5: `POST /employees` (multiple).
- **Composition:** `Stepper` top; per-step `Card`; "Skip for now" link on optional steps.
- **Step 1 — Organization profile**

  | Field | Validation |
  |---|---|
  | `name` | required, ≤ 120 |
  | `legal_name` | optional, ≤ 180 |
  | `timezone` | required, IANA, defaults to browser |
  | `currency` | ISO 4217, defaults from country |
  | `week_start` | dropdown |
  | `primary_color` | hex color picker (AA validated) |
  | `logo` | `UploadDropzone` (image, ≤ 2 MB) |

- **Step 2 — Working hours**: set default attendance policy (day_start/end, expected_hours, grace, work_days as checkbox grid).
- **Step 3 — Leave types**: editable list of seeded leave types; user toggles `is_active`, edits accrual.
- **Step 4 — Holidays**: choose preset (India / US / Empty) or upload CSV.
- **Step 5 — Invite teammates**: spreadsheet-like inline editor with rows; required fields per row; "Send invites later" optional.
- **On completion:** redirect to `/dashboard`; show `GettingStartedChecklistWidget`.

---

## A-DASH-001 — Admin Dashboard

- **Route:** `/dashboard` · **Layout:** `AdminLayout` · **Permission:** `dashboard.view`.
- **APIs:** `GET /dashboard/admin`.
- **Composition:** `PageHeader title="Dashboard"`; responsive grid of widgets.

### Widget specs

| Widget | Component | Behavior |
|---|---|---|
| `HeadcountWidget` | `StatCard` | value = `headcount.total`; delta = `headcount.delta_month`; click → `/employees`. |
| `PresentTodayWidget` | `StatCard` with mini bar | `present / absent / on_leave` counts; click → `/attendance`. |
| `PendingApprovalsWidget` | `Card` with list of two `StatCard`s side-by-side | leave + regularization counts; click → `/leave/requests?status=pending` and `/attendance/regularization`. |
| `UpcomingHolidaysWidget` | `Card` with list | up to 5 next holidays; click → `/holidays/calendars`. |
| `BirthdaysAnniversariesWidget` | `Card` with tabs | "Birthdays this week" + "Work anniversaries"; avatar + name. |
| `NewHiresWidget` | `Card` with `AvatarStack` + list | last 30 days. |
| `AttritionWidget` | `Card` with count + list | last 30 days. |
| `RecentAnnouncementsWidget` | list | latest 3; ack progress chip. |
| `AcknowledgmentComplianceWidget` | dual progress bars | doc % and announcement %. |
| `QuickActionsWidget` | grid of `Button` | New Employee, New Announcement, New Holiday, Bulk Import. |
| `GettingStartedChecklistWidget` | `Card` with checklist | shown until 100% complete; persists in `org_settings`. |

- **Loading:** widget-specific skeletons.
- **Empty (cold tenant):** "No employees yet. Invite your team to populate your dashboard." with primary CTA.
- **Error:** per-widget retry button; never crash the page.

---

## A-EMP-001 — Employees List

- **Route:** `/employees` · **Layout:** `AdminLayout` · **Permission:** `employee.read`.
- **APIs:** `GET /employees`, bulk via `POST /employees/:id/deactivate`, `POST /employees/:id/reactivate`.
- **Composition:** `PageHeader` (title "Employees", actions: `Button` "Add employee" + Dropdown "Bulk import" / "Export"); `FilterBar`; `DataTable`.

### Filters

| Filter | Type | Source |
|---|---|---|
| `q` | text search | name, email, code |
| `status` | multi | `invited, active, on_leave, suspended, offboarded` |
| `department_id` | multi | `/departments` |
| `designation_id` | multi | `/designations` |
| `location_id` | multi | `/locations` |
| `employment_type` | multi | enum |
| `manager_id` | combobox | `/employees` |

### Columns

| Column | Sortable | Render |
|---|---|---|
| Selection checkbox | — | — |
| Employee | by `display_name` | Avatar + name + employee_code subtitle; clickable → `/employees/[id]` |
| Work email | by `work_email` | text |
| Department | — | text |
| Designation | — | text |
| Location | — | text |
| Manager | — | Avatar + name |
| Status | — | `StatusBadge` |
| Joined | by `joined_on` | date |
| Actions | — | dropdown: Edit, Resend invite (invited), Deactivate, View profile |

### Bulk actions

- Deactivate (calls `POST /employees/:id/deactivate` per row in a single transaction; shows progress).
- Export selection → CSV.

### States

- **Empty (cold):** `EmptyState` "No employees yet" + Add employee + Bulk import.
- **Empty (filtered):** "No employees match your filters" + Clear filters.

---

## A-EMP-002 — Add Employee

- **Route:** `/employees/new` · **Layout:** `AdminLayout` · **Permission:** `employee.create`.
- **APIs:** `POST /employees`, `GET /departments|designations|locations|employees` for combobox sources.
- **Composition:** `PageHeader` + `Form` with sections (Personal, Employment, Notification).
- **Form fields:**

  **Personal**
  | Field | Validation |
  |---|---|
  | `first_name` | required, 1–60, Unicode letters/marks/spaces/hyphens |
  | `middle_name` | optional, 0–60 |
  | `last_name` | required, 1–60 |
  | `work_email` | required, RFC, ≤ 254, unique within org |
  | `personal_email` | optional, RFC |
  | `mobile_phone_e164` | optional, E.164 |
  | `date_of_birth` | optional, past date |
  | `gender` | optional, enum |
  | `profile_photo` | optional, `UploadDropzone` (image, ≤ 2 MB) |

  **Employment**
  | Field | Validation |
  |---|---|
  | `employee_code` | required, 1–32, `[A-Z0-9_-]`, unique within org; "Auto-generate" toggle |
  | `joined_on` | required, ≤ today + 90 days |
  | `department_id` | required, combobox |
  | `designation_id` | required, combobox |
  | `location_id` | required, combobox |
  | `manager_id` | optional, combobox excluding self |
  | `employment_type` | required, enum, default `full_time` |
  | `work_mode` | required, enum, default `onsite` |
  | `attendance_policy_id` | optional, defaults to org default |
  | `holiday_calendar_id` | optional, defaults to location's calendar |

  **Notification**
  | Field | Default |
  |---|---|
  | `send_invite` | `true` (controls whether the invite email goes out) |

- **Primary action:** "Send invite" (if `send_invite`) / "Create employee" (if not). Toast on success + redirect to detail.
- **Error mapping:** `conflict.email_taken` → highlight work_email; `conflict.employee_code_taken` → employee_code.

---

## A-EMP-003 — Import Employees

- **Route:** `/employees/import` · **Layout:** `AdminLayout` · **Permission:** `employee.import`.
- **APIs:** `POST /files/presign-upload`, `POST /employees/import/sessions`, `GET /employees/import/sessions/:id`, `POST /employees/import/sessions/:id/commit`.
- **Composition:** `Stepper` — (1) Upload CSV, (2) Map columns (auto-detect when headers match), (3) Validate, (4) Review preview & errors, (5) Confirm.

### Behavior

- Template download link at top.
- Per-row errors displayed in `DataTable` with column "Row #" + "Issue" + "Cell".
- On commit: `POST /sessions/:id/commit` returns 202; client polls `GET .../:id` every 2 s until `imported|error`.
- Final screen shows summary with "View created employees" CTA.

---

## A-EMP-010 — Employee Detail (Overview)

- **Route:** `/employees/[id]` · **Layout:** `AdminLayout` · **Permission:** `employee.read`.
- **APIs:** `GET /employees/:id`, `GET /employees/:id/leave-balances` (preview), `GET /me/notification-preferences` (admin context).
- **Composition:**
  - `PageHeader` with avatar, name, employee_code; right actions: `Edit`, dropdown (Resend invite, Deactivate, Reset password (sends reset email)).
  - `KpiBar`: Department, Designation, Location, Manager, Joined.
  - `Tabs`: Overview · Personal · Employment · Documents · Leave · Attendance (each tab is a separate route — see below).
- **Overview content:** `KeyValueList` of contact info; quick widgets: "On leave today?", "Leave balances" (top 3 leave types), "Last 5 announcements ack'd?", "Documents pending ack: N".
- **Header KPIs are colored via `StatusBadge` when applicable** (e.g., status badge in header).

---

## A-EMP-011 — Employee Personal Tab

- **Route:** `/employees/[id]/personal` · **Layout:** `AdminLayout` · **Permission:** `employee.read`.
- **APIs:** `GET /employees/:id`, `GET /employees/:id/addresses`, `GET /employees/:id/emergency-contacts`.
- **Composition:**
  - Section "Personal Info" with `KeyValueList` and `InlineEdit` controls per field (admin can edit any).
  - Section "Addresses" with cards per `kind` (Current/Permanent/Mailing) and add/edit/delete actions.
  - Section "Emergency Contacts" with `DataTable` (compact density) + add modal.

---

## A-EMP-012 — Employee Employment Tab

- **Route:** `/employees/[id]/employment` · **Layout:** `AdminLayout` · **Permission:** `employee.read`.
- **APIs:** `GET /employees/:id/employments`, `POST /employees/:id/employments`.
- **Composition:** Timeline of `employments` rows; "Add change" button opens `Drawer` form (effective_from, designation_id, department_id, location_id, manager_id, employment_type, change_reason).
- **Validation:** `effective_from > previous.effective_from`; auto-closes previous row server-side.

---

## A-EMP-013 — Employee Documents Tab

- **Route:** `/employees/[id]/documents` · **Layout:** `AdminLayout` · **Permission:** `employee.documents.read`.
- **APIs:** `GET /employees/:id/documents`.
- **Composition:** `DataTable` of docs visible to this employee. Columns: Title, Category, Source (Personal / Organizational), Issued, Acknowledged?, Required?, Due, Actions (download, view).
- **Action:** "Upload personal document for this employee" → modal calling `POST /me/documents` against this employee (admin-on-behalf).

---

## A-EMP-014 — Employee Leave Tab

- **Route:** `/employees/[id]/leave` · **Layout:** `AdminLayout` · **Permission:** `leave.read`.
- **APIs:** `GET /employees/:id/leave-balances`, `GET /employees/:id/leave-ledger`, `GET /leave-requests?employee_id=…`.
- **Composition:**
  - "Balances" — grid of `StatCard`s per active leave type (available / used / accrued).
  - "Adjust balance" admin button (perm `leave.balance.adjust`) → modal: leave_type, units (+/-), note. Calls `POST /employees/:id/leave-balances/:typeId/adjust`.
  - "Ledger" — collapsible `DataTable`.
  - "Requests" — `DataTable` of leave requests (columns: type, dates, status, decided_by, decided_at).

---

## A-EMP-015 — Employee Attendance Tab

- **Route:** `/employees/[id]/attendance` · **Layout:** `AdminLayout` · **Permission:** `attendance.read`.
- **APIs:** `GET /attendance?employee_id=…`, `GET /attendance/summary?employee_id=…`.
- **Composition:**
  - "This month" summary cards: Present / Absent / Late / On Leave.
  - `MonthCalendar` heatmap (cells colored by status).
  - `DataTable` of records (date, check-in, check-out, worked hours, status, regularized?).
- **Row action:** "Mark regularization" → opens admin-on-behalf regularization form.

---

## A-EMP-020 — Employee Edit

- **Route:** `/employees/[id]/edit` · **Layout:** `AdminLayout` · **Permission:** `employee.update`.
- **APIs:** `GET /employees/:id`, `PATCH /employees/:id`.
- **Composition:** same shape as `A-EMP-002` but with prefilled fields and tab-respecting deep-link (`?tab=employment`).
- **Destructive action:** "Deactivate employee" footer with `ConfirmDialog` (typeToConfirm = employee name).

---

## A-ATT-001 — Attendance Today

- **Route:** `/attendance` · **Layout:** `AdminLayout` · **Permission:** `attendance.read`.
- **APIs:** `GET /attendance/today`.
- **Composition:**
  - `PageHeader` with the date label and "View history" link.
  - Row of summary `StatCard`s (Present, Absent, On Leave, Holiday, Late).
  - `FilterBar` (department, location, status); `DataTable` of employees with their status, check-in time, late?, worked-hours.
- **Auto-refresh:** every 60 s (poll); manual refresh button.
- **Action:** row dropdown "Open profile", "Add regularization on behalf".

---

## A-ATT-002 — Attendance History

- **Route:** `/attendance/history` · **Layout:** `AdminLayout` · **Permission:** `attendance.read`.
- **APIs:** `GET /attendance`, `GET /attendance/export`.
- **Composition:** date-range default = last 30 days, filterable; `DataTable` paginated. Export CSV button.
- **Columns:** Date, Employee, Department, Location, Check-in, Check-out, Worked, Status, Late, Regularized.

---

## A-ATT-003 — Regularization Inbox

- **Route:** `/attendance/regularization` · **Layout:** `AdminLayout` · **Permission:** `attendance.approve`.
- **APIs:** `GET /attendance/regularizations`, `POST /attendance/regularizations/:id/approve|reject`.
- **Composition:** tabs Pending / Approved / Rejected; default Pending; `DataTable`; row click opens `Drawer` with full request.
- **Drawer form:** comment (textarea) + Approve / Reject buttons.
- **Bulk action:** Approve selected.
- **Empty (Pending):** "All caught up — no pending regularizations.".

---

## A-ATT-004 — Attendance Reports

- **Route:** `/attendance/reports` · **Layout:** `AdminLayout` · **Permission:** `attendance.read`.
- **APIs:** `GET /attendance/summary?group_by=…`.
- **Composition:** filter row + chart panel (bar chart of present/absent/late counts by day or by department) + `DataTable` data table.
- **Export:** CSV; chart can be downloaded as PNG.

---

## A-LV-001 — Leave Requests

- **Route:** `/leave/requests` · **Layout:** `AdminLayout` · **Permission:** `leave.read`.
- **APIs:** `GET /leave-requests`, approve/reject endpoints.
- **Composition:** `PageHeader` (title, action: "Export"). `FilterBar` (status default pending, type, employee, date range, department). `DataTable`.
- **Columns:** Employee, Leave type (`LeaveTypePill`), Dates, Days, Reason (truncate), Status, Submitted, Actions (Approve/Reject/View).
- **Row interaction:** click row → opens `Drawer` (A-LV-002 content) without leaving the list.

---

## A-LV-002 — Leave Request Detail

- **Route:** `/leave/requests/[id]` · **Layout:** `AdminLayout` · **Permission:** `leave.read`.
- **APIs:** `GET /leave-requests/:id`, `GET /leave-requests/:id/approval-history`, `POST /leave-requests/:id/approve|reject`.
- **Composition:**
  - Header: employee chip, leave type, status badge, "Open employee profile" link.
  - Body: dates with day counts; reason; contact during leave; attachment if any.
  - Sidebar: balance preview (before/after), overlapping team leaves (top 5 of `GET /leave-calendar`), employee's recent attendance.
  - Approval history timeline.
- **Actions:** Approve (with optional comment), Reject (comment required if rejecting; warn if balance was sufficient and reason is empty).
- **Edge case:** if request is `withdrawn` post-approval, admin sees the history and a "Restore" stub action (Phase 2).

---

## A-LV-003 — Leave Calendar

- **Route:** `/leave/calendar` · **Layout:** `AdminLayout` · **Permission:** `leave.read`.
- **APIs:** `GET /leave-calendar`, `GET /me/holidays`, `GET /holiday-calendars/:id/holidays`.
- **Composition:** `MonthCalendar`. Each leave shows as a `LeaveTypePill` band. Holidays overlay as tinted bands.
- **Filters:** department, location, leave type, employee combobox.
- **Day click:** `Drawer` showing every leave on that day.

---

## A-LV-004 — Leave Balances

- **Route:** `/leave/balances` · **Layout:** `AdminLayout` · **Permission:** `leave.read`.
- **APIs:** `GET /leave-types?is_active=true`, then bulk balance query (`GET /employees?...&include=balances` or per-employee via the existing endpoint).
- **Composition:** `DataTable` pivot — rows = employees, columns = leave types' `available` units. Filters by department, location.
- **Export:** CSV.
- **Drill-in:** click cell → drawer with ledger entries.

---

## A-LV-005 — Leave Types

- **Route:** `/leave/types` · **Layout:** `AdminLayout` · **Permission:** `leave.policy.read`.
- **APIs:** `GET /leave-types`, `DELETE /leave-types/:id`, `PATCH /leave-types/:id` for `is_active` toggle.
- **Composition:** `DataTable` (Name, Code, Color swatch, Accrual, Active toggle, Actions).

---

## A-LV-006 — Leave Type: New

- **Route:** `/leave/types/new` · **Layout:** `AdminLayout` · **Permission:** `leave.policy.write`.
- **APIs:** `POST /leave-types`.
- **Form:**

  | Field | Validation |
  |---|---|
  | `name` | required, ≤ 80, unique within org |
  | `code` | required, ≤ 20, `[A-Z0-9_-]`, unique within org |
  | `color` | hex |
  | `unit` | enum |
  | `is_paid` | switch |
  | `requires_approval` | switch |
  | `accrual_type` | enum |
  | `accrual_amount` | numeric ≥ 0 |
  | `max_balance` | numeric ≥ 0, optional |
  | `carry_forward_max` | numeric ≥ 0, optional |
  | `min_request_units` | numeric ≥ 0 |
  | `max_request_units` | numeric ≥ 0, optional, ≥ min |
  | `notice_days_required` | int ≥ 0 |
  | `requires_attachment_after_days` | int ≥ 0, optional |
  | `gender_restriction` | optional enum |
  | `applies_after_days_of_service` | int ≥ 0, optional |
  | `description` | optional rich-text-lite |

- **Preview panel:** computes "example balance after 6 months" given accrual settings.

---

## A-LV-007 — Leave Type: Edit

- **Route:** `/leave/types/[id]` · same as A-LV-006 with prefill. **Warning** on save: "Updating accrual will affect future periods only; existing balances stay."

---

## A-DOC-001 — Documents List

- **Route:** `/documents` · **Layout:** `AdminLayout` · **Permission:** `document.read`.
- **APIs:** `GET /documents`, `POST /documents/:id/remind`.
- **Composition:** filterable `DataTable` (Title, Category, Audience summary, Required?, Due, Ack progress, Published, Actions).
- **Cell render:** Ack progress as `AcknowledgmentProgress`.
- **Row actions:** Open, Edit (if draft), Remind, Archive.

---

## A-DOC-002 — Document Upload / Compose

- **Route:** `/documents/new` · **Layout:** `AdminLayout` · **Permission:** `document.create`.
- **APIs:** `POST /files/presign-upload`, `POST /files/confirm-upload`, `POST /documents`, `POST /announcements/audience/preview`.
- **Composition:** two-column form.
  - Left: file upload (`UploadDropzone`), title, description, category (Combobox), audience (`AudienceSelector` — kind + values), `requires_acknowledgment` switch + `due_by` date, `is_personal` switch (when true, force `subject_employee_id`).
  - Right: live audience preview (count + `AvatarStack`).
- **Validation:** category required; file required ≤ 25 MB; audience must resolve to ≥ 1 employee.
- **Primary action:** `Publish now` or `Save draft` (segmented button).

---

## A-DOC-003 — Document Detail

- **Route:** `/documents/[id]` · **Layout:** `AdminLayout` · **Permission:** `document.read`.
- **APIs:** `GET /documents/:id`, `GET /documents/:id/acknowledgments`, `POST /documents/:id/remind`, `PATCH /documents/:id`, `POST /documents/:id/publish|archive`.
- **Composition:**
  - Header: title, category, status badge.
  - File preview panel (PDF inline; image inline; other → "Download" CTA).
  - `AcknowledgmentProgress` + tabs: Acknowledged / Pending; tables with employee + timestamps.
  - Actions: Edit / Publish / Archive / Remind pending.

---

## A-DOC-004 — Document Categories

- **Route:** `/documents/categories` · **Layout:** `AdminLayout` · **Permission:** `document.category.write`.
- **APIs:** CRUD on `/documents/categories`.
- **Composition:** `DataTable` (Name, Personal?, Description, # docs, Actions).
- **Form modal:** name, description, is_personal switch.

---

## A-ANN-001 — Announcements List

- **Route:** `/announcements` · **Layout:** `AdminLayout` · **Permission:** `announcement.read`.
- **APIs:** `GET /announcements`.
- **Composition:** `DataTable` (Title, Audience, Priority, Pinned?, Published, Ack? %, Status, Actions).

---

## A-ANN-002 — Announcement Composer

- **Route:** `/announcements/new` · **Layout:** `AdminLayout` · **Permission:** `announcement.create`.
- **APIs:** `POST /announcements`, `POST /announcements/:id/publish`, `POST /announcements/audience/preview`.
- **Composition:** Three-pane.
  - Left: form (title, priority, pinned, requires_acknowledgment, audience selector, schedule_for, expires_at).
  - Center: `RichTextEditor`.
  - Right: audience preview + Preview (renders the announcement card as employees will see it).
- **Validation:**

  | Field | Rule |
  |---|---|
  | `title` | required, ≤ 180 |
  | `body_html` | required, ≤ 50 KB, sanitized |
  | `audience` | resolves to ≥ 1 employee |
  | `scheduled_for` | optional, > now |
  | `expires_at` | optional, > scheduled_for (or > now) |

- **Actions:** Save draft / Schedule / Publish now.
- **Auto-save:** draft every 2 s of inactivity (writes to `localStorage` + server when title ≥ 3 chars).

---

## A-ANN-003 — Announcement Detail

- **Route:** `/announcements/[id]` · **Layout:** `AdminLayout` · **Permission:** `announcement.read`.
- **APIs:** `GET /announcements/:id`, `GET /announcements/:id/acknowledgments`.
- **Composition:** same as `A-DOC-003` but rendering rich text body. Actions: Edit (if not published), Publish, Archive, Remind pending.

---

## A-ANN-004 — Announcement Edit

- **Route:** `/announcements/[id]/edit` · same shape as composer with prefill. If published, only title/expires_at editable; the body editor shows a "Read-only" notice.

---

## A-HOL-001 — Holiday Calendars List

- **Route:** `/holidays/calendars` · **Layout:** `AdminLayout` · **Permission:** `holiday.read`.
- **APIs:** `GET /holiday-calendars`, `POST /holiday-calendars/:id/set-default`.
- **Composition:** `DataTable` (Name, Country, Region, # holidays this year, Default?, Assignments count, Actions).

---

## A-HOL-002 — Calendar: New

- **Route:** `/holidays/calendars/new` · **Layout:** `AdminLayout` · **Permission:** `holiday.write`.
- **APIs:** `POST /holiday-calendars`.
- **Form:** name (required), country (ISO 2), region, description, is_default switch.

---

## A-HOL-003 — Calendar Detail

- **Route:** `/holidays/calendars/[id]` · **Layout:** `AdminLayout` · **Permission:** `holiday.read`.
- **APIs:** `GET /holiday-calendars/:id`, `GET /holiday-calendars/:id/holidays`, `GET/PUT /holiday-calendars/:id/assignments`.
- **Composition:**
  - Tabs: Holidays · Assignments.
  - Holidays tab: `DataTable` (Date, Name, Kind, Optional?, Actions). "Add holiday" button → modal form.
  - Assignments tab: list of scopes (Org / Location / Department / Employee) with PUT-replace UX.

---

## A-HOL-004 — Calendar: Bulk Import

- **Route:** `/holidays/calendars/[id]/import` · **Layout:** `AdminLayout` · **Permission:** `holiday.write`.
- **APIs:** `POST /files/presign-upload`, `POST /holiday-calendars/:id/import`.
- **Composition:** `Stepper` (Upload → Validate → Confirm); preview table; final summary.

---

## A-SET-001 — Settings: Organization

- **Route:** `/settings/organization` · **Layout:** `AdminLayout` · **Permission:** `org.settings.read`.
- **APIs:** `GET /organization`, `PATCH /organization`.
- **Composition:** form sections (Identity, Locale, Working Week, Contact, Plan info read-only).
- **Fields:** as in A-ONB-001 step 1, with `slug` read-only and `legal_name`, `domain`, `billing_email` editable.

---

## A-SET-002 — Settings: Branding

- **Route:** `/settings/branding` · **Layout:** `AdminLayout` · **Permission:** `org.settings.write`.
- **APIs:** `PATCH /organization`, `POST /organization/logo`.
- **Composition:** logo uploader; primary color picker with live preview (renders a mock card next to the picker); reset to defaults.

---

## A-SET-010 — Settings: Departments

- **Route:** `/settings/departments` · **Layout:** `AdminLayout` · **Permission:** `org.structure.read`.
- **APIs:** `/departments` CRUD.
- **Composition:** tree-view of departments (parent/child) + actions; add/edit modal.
- **Delete with reassign:** if in use, modal asks "Reassign 12 employees to which department?".

---

## A-SET-011 — Settings: Designations

- **Route:** `/settings/designations` · `DataTable` (Name, Level, # employees, Actions); add/edit modal.

---

## A-SET-012 — Settings: Locations

- **Route:** `/settings/locations` · `DataTable` (Name, Code, City, Country, Timezone, Default Holiday Calendar, # employees, Actions); add/edit modal.

---

## A-SET-020 — Policies: Leave

- **Route:** `/settings/policies/leave` · **Layout:** `AdminLayout` · **Permission:** `leave.policy.read`.
- **APIs:** `GET /leave-types`, `GET /organization/settings`.
- **Composition:** Org defaults form (year start month/day, notice required for unpaid, attachment-required threshold default). Link to A-LV-005 for per-type config.

---

## A-SET-021 — Policies: Attendance

- **Route:** `/settings/policies/attendance` · **Permission:** `attendance.policy.read`.
- **APIs:** `/policies/attendance` CRUD.
- **Composition:** list of policies + add/edit form (fields per `02 § 2.4.1`).

---

## A-SET-030 — Roles & Permissions

- **Route:** `/settings/roles` · **Permission:** `rbac.read`.
- **APIs:** `/rbac/roles`, `/rbac/permissions`.
- **Composition:** `DataTable` (Name, Key, # permissions, # users, System?, Actions). Search by name; create-role button.

---

## A-SET-031 — Role Editor

- **Route:** `/settings/roles/[id]` · **Permission:** `rbac.write`.
- **APIs:** `/rbac/roles/:id`, `/rbac/roles/:id/permissions`.
- **Composition:**
  - Left: role name/description.
  - Right: permission matrix grouped by resource. Each permission row toggles enabled + scope dropdown (`global | team | self | assigned`) where applicable.
  - Sticky footer with Save / Cancel.
- **System roles:** read-only; show "Duplicate to customize".

---

## A-SET-040 — Notification Settings (org-level)

- **Route:** `/settings/notifications` · **Permission:** `org.settings.read`.
- **APIs:** `GET /organization/notifications`, `PATCH /organization/notifications`.
- **Composition:** table of templates with toggles for `email_default_enabled`, `inapp_default_enabled`. Notes about overrides per user.

---

## A-SET-050 — Audit Log

- **Route:** `/settings/audit-log` · **Permission:** `audit.read`.
- **APIs:** `GET /audit-logs` with cursor pagination.
- **Composition:** `FilterBar` (actor, action, resource_type, date range) + virtualized `DataTable`.
- **Row click:** opens drawer showing before/after JSON diff.

---

## A-SET-090 — My Admin Profile

- **Route:** `/settings/profile` · **Permission:** self.
- **APIs:** `GET /auth/me`, `PATCH /employees/:meId`, `POST /auth/change-password`, `POST /auth/2fa/*`.
- **Composition:** tabs Profile · Security · Notifications.
  - Profile: edit name, profile photo, personal email, mobile.
  - Security: change password, 2FA enroll/disable, active sessions list (Phase 2 placeholder showing current session only in Phase 1).
  - Notifications: per-template overrides for the admin user.

---

## A-NOT-001 — Notifications Inbox

- **Route:** `/notifications` · **Permission:** self.
- **APIs:** `GET /me/notifications`, `POST /me/notifications/:id/read`, `POST /me/notifications/read-all`.
- **Composition:** list view, filters Unread / All / Mentions (Phase 2). Each row: icon (template), summary text (templated from `payload`), timestamp, "Open" link.
- **Empty:** "You're all caught up.".

---

## A-SRC-001 — Search Results

- **Route:** `/search?q=…` · **Permission:** any.
- **APIs:** `GET /search`.
- **Composition:** sectioned results — People / Documents / Announcements. Each section limited to 10; "See more" link applies the type filter and routes to the corresponding list.

---

## Error pages

- **A-ERR-403:** "You don't have access." + back link.
- **A-ERR-404:** "We can't find that." + back link.
- **A-ERR-500:** "Something went wrong." + retry + support email link.

---

## Cross-screen behaviors

### Cmd-K palette

- Routes: every screen in the sidebar.
- Searches: employees, documents, announcements.
- Server-backed via `/search`; results cached for 30 s; debounced 200 ms.

### Toasts

- Use `Toaster` (Sonner). Success: "Leave approved". Error: "Couldn't approve — try again.".

### Bulk-action progress

- For multi-row mutations, show a sticky progress at the top of the table; on completion summarize "Approved 7 of 8 (1 failed: insufficient balance)".

### Optimistic updates

- Approve/Reject: optimistic status change with rollback on server error.
- Delete row: optimistic remove with undo toast (5 s).

---

## Implementation hints for the UI agent

- Each screen is a Next.js segment under `apps/admin/app/<route>/page.tsx` with a `loading.tsx` skeleton, an `error.tsx` boundary, and (for data-heavy screens) a server component fetching initial state and passing to a client component that owns TanStack Query keys.
- Permission gating: pages render via `<RequirePermission keys={[...]}>` HOC which redirects to `/403` if missing.
- Forms: a single `useFormSchema(schema)` hook wires RHF + Zod and returns a typed `<Form>` provider.
- All endpoint calls go through a `apiClient` (TanStack Query mutations + queries) with typed inputs from `packages/types`.
