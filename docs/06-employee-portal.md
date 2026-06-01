# 06 — Employee Portal: Screen-by-Screen Specification

> **Status:** Phase 4. One section per screen ID declared in `01 § 9.2`. The employee portal is mobile-first, deliberately shallow, and focused on the daily HR actions employees take themselves. Cross-references to `02-database-design.md`, `03-api-specification.md`, and `04-design-system.md` use the same conventions as `05-admin-portal.md`.

---

## E-AUTH-001 — Sign In

- **Route:** `/auth/sign-in` · **Layout:** `AuthLayout` · **Permission:** public.
- **APIs:** `POST /auth/sign-in`, `POST /auth/two-factor/verify`.
- **Form & behavior:** identical to `A-AUTH-001`. After successful auth, server returns `default_portal=employee` and client lands on `/dashboard` here.

---

## E-AUTH-002 — Forgot Password

- Identical to `A-AUTH-002`.

---

## E-AUTH-003 — Reset Password

- Identical to `A-AUTH-003`.

---

## E-AUTH-004 — Two-Factor

- Identical to `A-AUTH-004`.

---

## E-AUTH-005 — Accept Invite

- Identical to `A-AUTH-005` but post-success redirects to employee dashboard.

---

## E-DASH-001 — Employee Dashboard

- **Route:** `/dashboard` · **Layout:** `EmployeeLayout` · **Permission:** self.
- **APIs:** `GET /dashboard/employee`, `POST /attendance/check-in`, `POST /attendance/check-out`.
- **Composition:**
  - Greeting block: "Good morning, {first_name}" + today's date in employee tz.
  - Primary action card: `TodayStatusWidget` — large check-in/out button.
  - Two-column grid (collapses to stack on mobile) of widgets.

### Widget specs

| Widget | Component | Detail |
|---|---|---|
| `TodayStatusWidget` | hero `Card` | Shows today's status. Primary CTA: "Check in" if not yet (07:00–10:00 grace), "Check out" if checked in, "Day complete" if both. Secondary text shows expected start/end, "You're {n} min late" warning, "On leave today" banner if applicable, "Holiday" if applicable. |
| `MyLeaveBalanceWidget` | `Card` with top-3 leave types | Each row: `LeaveTypePill` + available units; "View all" link → `/leave`. |
| `MyNextLeaveWidget` | `Card` | Shows next approved leave (type, dates, "in N days") or empty state "No upcoming leave — Apply now". |
| `PendingTasksWidget` | `Card` list | "Acknowledge {n} documents", "Acknowledge {n} announcements", "Regularize {n} attendance records". Each row is a CTA. |
| `AnnouncementsWidget` | `Card` list | Latest 3 published announcements available to me; pinned ones first; click → `/announcements/[id]`. |
| `UpcomingHolidaysWidget` | `Card` | Next 3 holidays applicable to me. |
| `TeamBirthdaysWidget` | `Card` | Same-department teammates with birthdays this week; tasteful (no year). |
| `QuickActionsWidget` | row of `Button` | Apply leave, Regularize, Upload document. |

- **States:** widget-level loading skeletons; pending-tasks shows celebratory "All caught up!" when empty.

---

## E-PRO-001 — Profile Overview

- **Route:** `/profile` · **Layout:** `EmployeeLayout` · **Permission:** self.
- **APIs:** `GET /auth/me`, `GET /employees/:meId`.
- **Composition:**
  - Top: avatar + display name + employee_code + status badge; "Edit profile photo" inline action.
  - `KpiBar`: Department, Designation, Location, Manager (avatar + name, mailto link), Joined.
  - `Tabs`: Overview · Personal · Contacts · Employment · Documents · Security (each is a sibling route).

### Overview content

- `KeyValueList` (work email, mobile, blood group, time zone).
- "My current leave balance" preview card (top 3 leave types) with CTA to `/leave`.
- "My next leave" card.

---

## E-PRO-002 — Personal Info

- **Route:** `/profile/personal` · **Permission:** self.
- **APIs:** `GET /employees/:meId`, `PATCH /employees/:meId`, `GET /employees/:meId/addresses`, address CRUD.
- **Composition:**
  - "Personal info" form (self-editable fields only):

    | Field | Editable |
    |---|---|
    | `personal_email` | yes |
    | `mobile_phone_e164` | yes |
    | `date_of_birth` | yes (locked once set; admin can unlock — Phase 2 placeholder) |
    | `gender` | yes |
    | `marital_status` | yes |
    | `nationality` | yes |
    | `blood_group` | yes |
    | `profile_photo` | yes |

  - "Addresses" cards per kind (Current / Permanent / Mailing) — add/edit/delete.

- **Validation:** same as `A-EMP-002` for each field type. Server returns `validation.*` for invalid values.
- **Behavior:** save uses `PATCH /employees/:meId` for the personal-info section; addresses use the address sub-resource endpoints.

---

## E-PRO-003 — Emergency Contacts

- **Route:** `/profile/contacts` · **Permission:** self.
- **APIs:** `GET/POST/PATCH/DELETE /employees/:meId/emergency-contacts/...`.
- **Composition:** `DataTable` (compact) of contacts. Mark-as-primary toggle (only one primary).
- **Form modal:** name, relationship, phone (E.164), phone_alt, email, is_primary.
- **Validation:** name 1–120; relationship 1–40; phone E.164 required; at least one primary contact recommended (warn, not block).

---

## E-PRO-004 — Employment History

- **Route:** `/profile/employment` · **Permission:** self.
- **APIs:** `GET /employees/:meId/employments`.
- **Composition:** read-only timeline of `employments` rows (newest first) showing effective_from, designation, department, manager, change_reason.
- **State:** empty when `employments` is empty (rare — only for record-only employees).

---

## E-PRO-005 — Personal Documents

- **Route:** `/profile/documents` · **Permission:** self.
- **APIs:** `GET /me/documents`, `POST /me/documents`, `POST /files/presign-upload`.
- **Composition:**
  - Section "Issued to me" — read-only list of documents (offer letter, appointment letter, etc.). Each row: title, category, issued date, "Download".
  - Section "Documents I uploaded" — list of self-uploaded docs (e.g., PAN, address proof). Add via `UploadDropzone`.
- **Form (upload modal):** category (limited to `is_personal=true`), title, file. Validations: file ≤ 25 MB; mime allowlist (`pdf`, `jpg`, `png`).

---

## E-PRO-006 — Security

- **Route:** `/profile/security` · **Permission:** self.
- **APIs:** `POST /auth/change-password`, `POST /auth/2fa/enroll`, `POST /auth/2fa/activate`, `POST /auth/2fa/disable`, `POST /auth/logout-all`.
- **Composition:**
  - "Change password" form (current_password, new_password, confirm).
  - "Two-factor authentication" card with enable/disable flow (shows QR + secret on enroll; recovery codes on activate).
  - "Active sessions" list (Phase 1: current session only) + "Sign out everywhere" button.
- **Behavior:** changing password revokes existing refresh tokens; show informational toast.

---

## E-ATT-001 — Attendance Today

- **Route:** `/attendance` · **Permission:** self.
- **APIs:** `GET /attendance/me/today`, `POST /attendance/check-in`, `POST /attendance/check-out`.
- **Composition:**
  - Hero check-in/out card (mirrors dashboard widget; allows note).
  - Below: "This week" mini-summary (5–7 day chips with status colors).
  - "View history" link → `E-ATT-002`.
- **Edge cases:**
  - If `domain.on_leave`: card blocks check-in; shows "You're on approved leave today.".
  - If `domain.weekend_off`: shows "Today is a weekoff. Working anyway?" with override `force=true`.
- **Mobile:** card and weekly summary stack; large tap targets for check-in/out.

---

## E-ATT-002 — Attendance History

- **Route:** `/attendance/history` · **Permission:** self.
- **APIs:** `GET /attendance/me`.
- **Composition:**
  - Date range picker, defaults to current month.
  - Summary cards: Present, Absent, Late, On Leave.
  - `DataTable` (Date, Check-in, Check-out, Worked, Status, Regularized?, Actions).
  - Row action: "Regularize" (if eligible per policy regularization window).
- **Mobile:** table → card-list with the same info.

---

## E-ATT-003 — Regularize: New

- **Route:** `/attendance/regularize/new` · **Permission:** self.
- **APIs:** `POST /attendance/regularizations`, `GET /attendance/me` for context.
- **Form:**

  | Field | Validation |
  |---|---|
  | `attendance_date` | required, within policy window (default 14 days back); not future |
  | `requested_check_in_at` | required, on `attendance_date`, before now |
  | `requested_check_out_at` | optional, after check-in, before now |
  | `reason` | required, 10–1000 chars |
  | `attachment` | optional, `UploadDropzone` |

- **Server errors mapped:** `domain.regularization_window_exceeded`, `domain.regularization_duplicate`.
- **Success:** toast + redirect to detail `E-ATT-004`.

---

## E-ATT-004 — Regularize: Detail

- **Route:** `/attendance/regularize/[id]` · **Permission:** self.
- **APIs:** `GET /attendance/regularizations/:id`, `POST /attendance/regularizations/:id/cancel` (when pending).
- **Composition:** request summary + status badge + approval comment if decided. Cancel action only while `pending`.

---

## E-LV-001 — Leave Home

- **Route:** `/leave` · **Permission:** self.
- **APIs:** `GET /me/leave-balances`, `GET /leave-requests?employee_id=meId&limit=5`.
- **Composition:**
  - Hero balance grid: card per active leave type (`LeaveTypePill` + `available` + small breakdown opening/accrued/used/reserved).
  - "Apply for leave" primary button.
  - Recent requests list (5 latest): leave type, dates, status, action (View / Cancel if pending / Withdraw if approved-not-started).

---

## E-LV-002 — Apply for Leave

- **Route:** `/leave/apply` · **Permission:** self.
- **APIs:** `GET /leave-types?is_active=true`, `GET /me/leave-balances`, `GET /leave-calendar?employee_id=meId&from=…&to=…`, `POST /files/presign-upload`, `POST /leave-requests`.
- **Composition:** two-pane (left form, right summary on `lg+`; stacked on mobile).

### Form fields

| Field | Validation |
|---|---|
| `leave_type_id` | required; selecting updates the right pane (balance + policy rules) |
| `start_date` | required; not before today + `notice_days_required` from policy (admins can override — not here); not after `applies_after_days_of_service` future cap if any |
| `end_date` | required; ≥ start_date |
| `is_half_day_start` | toggle; only if `leave_unit ≠ hour` |
| `is_half_day_end` | toggle |
| `reason` | required, 5–1000 chars |
| `contact_during_leave` | optional, ≤ 500 chars |
| `attachment` | required when `requested_units > requires_attachment_after_days` |

### Right pane

- Calendar preview showing chosen range + holidays + teammates' overlapping leaves.
- Balance preview: current `available` → after request (computed client-side, validated server-side).
- Inline warnings:
  - "This range overlaps a holiday — those days aren't counted.".
  - "Your manager will be notified.".

### Submit & errors

- Map server errors:
  - `domain.leave_insufficient_balance` → highlight balance preview red.
  - `domain.leave_overlap` → highlight calendar.
  - `domain.leave_notice_required` → highlight start_date.
  - `domain.leave_attachment_required` → highlight attachment.
  - `domain.leave_blackout` → highlight calendar with policy note.

---

## E-LV-003 — Leave History

- **Route:** `/leave/history` · **Permission:** self.
- **APIs:** `GET /leave-requests?employee_id=meId`.
- **Composition:** `FilterBar` (status, leave_type_id, date range) + `DataTable` (Type, Dates, Days, Status, Submitted, Decided, Actions).
- **Empty:** "You haven't applied for any leave yet." + Apply button.

---

## E-LV-004 — Leave Detail

- **Route:** `/leave/[id]` · **Permission:** self.
- **APIs:** `GET /leave-requests/:id`, `GET /leave-requests/:id/approval-history`, `PATCH /leave-requests/:id`, `POST /leave-requests/:id/cancel|withdraw`.
- **Composition:** summary card + approval timeline + attachment preview if any.
- **Actions:**
  - If `pending`: Edit, Cancel.
  - If `approved` and `start_date > today`: Withdraw.
  - If `approved` and started: read-only (with "Contact HR to amend" hint).
  - If `rejected` / `cancelled` / `withdrawn`: read-only.

---

## E-LV-005 — Leave Calendar

- **Route:** `/leave/calendar` · **Permission:** self.
- **APIs:** `GET /leave-calendar?employee_id=meId|department_id=mine`, `GET /me/holidays`.
- **Composition:** `MonthCalendar` with my leaves (filled) + team leaves (outlined) + holidays (band).
- **Filter toggle:** "Just me" / "My team" / "My department".

---

## E-DOC-001 — Documents Inbox

- **Route:** `/documents` · **Permission:** self.
- **APIs:** `GET /me/documents`.
- **Composition:**
  - Tabs: Pending acknowledgment · Acknowledged · Personal.
  - Each tab: `DataTable` (Title, Category, Required?, Due, Acknowledged?, Actions).
  - Empty in Pending: "You're all caught up.".
- **Mobile:** table → card list.

---

## E-DOC-002 — Document Detail

- **Route:** `/documents/[id]` · **Permission:** self.
- **APIs:** `GET /documents/:id` (with audience-gated 404 if not allowed), `POST /documents/:id/acknowledge`, `GET /files/:key/download`.
- **Composition:**
  - Title + category + status banner ("Acknowledgment required by July 15").
  - File preview (PDF inline, image inline, other → Download).
  - Sticky bottom bar (on mobile) or right rail (on desktop) with "Acknowledge" button if pending.
- **Post-acknowledge:** badge updates to "Acknowledged on {date}".

---

## E-DOC-003 — Upload Document

- **Route:** `/documents/upload` · **Permission:** self.
- **APIs:** `POST /files/presign-upload`, `POST /me/documents`.
- **Form:** category (personal categories only), title, file. Validation: same as `E-PRO-005` upload modal.

---

## E-ANN-001 — Announcements Feed

- **Route:** `/announcements` · **Permission:** self.
- **APIs:** `GET /me/announcements`.
- **Composition:** card feed (pinned first, then newest). Each card: title, snippet (200 chars), published_at, priority badge if `high`, "Acknowledge required" pill if applicable.
- **Mark-as-read:** opening a card marks it read (in-app notification only); ack required is separate explicit action.

---

## E-ANN-002 — Announcement Detail

- **Route:** `/announcements/[id]` · **Permission:** self.
- **APIs:** `GET /announcements/:id`, `POST /announcements/:id/acknowledge`.
- **Composition:** full title + body rendered from sanitized HTML; cover image at top if present; "Acknowledge" sticky CTA.

---

## E-HOL-001 — Holidays Calendar

- **Route:** `/holidays` · **Permission:** self.
- **APIs:** `GET /me/holidays?year=`.
- **Composition:**
  - Year toggle.
  - `MonthCalendar` with holiday bands and "Optional" badge where applicable.
  - List view fallback below: sorted by `observed_on`.

---

## E-NOT-001 — Notifications Inbox

- Identical to `A-NOT-001`.

---

## E-HLP-001 — Help

- **Route:** `/help` · **Permission:** self.
- **APIs:** none (Phase 1).
- **Composition:** static cards with FAQs + "Contact your HR" CTA (mailto: org HR group, resolved server-side via `/auth/me` if available, else company billing email).

---

## Error pages

- **E-ERR-403 / 404 / 500:** same shape as admin counterparts.

---

## Cross-cutting behaviors

### Mobile nav

- Sidebar hidden under `md`; replaced by a 5-tab bottom nav: Dashboard, Attendance, Leave, Documents, More (sheet for Profile/Announcements/Holidays/Help/Notifications).

### Cmd-K palette

- Same `CommandPalette` component as admin, configured with employee-visible routes and search domains (documents, announcements, holidays).

### Time zone display

- Every timestamp rendered in the employee's effective tz (`employees.timezone_override || organization.timezone`).
- Calendars highlight "today" using the employee tz.

### Localization

- All strings flow through `t('key')` even in employee portal so a future translation pass is mechanical (`packages/i18n/locales/en.json`).

### Permission gating

- Employee portal never shows admin actions even if a user has dual roles. Switching to the admin portal happens via the topbar portal switcher (see `01 § 8`).

### Optimistic UI

- Check-in/out toggles optimistically; rolls back on server error with a toast.
- Acknowledgments mark badges optimistically.

---

## Implementation hints for the UI agent

- Folder: `apps/employee/app/<segment>/page.tsx`. Pages mostly client components (interactive) wrapped by RSC for initial fetch.
- Layout: `apps/employee/app/(authed)/layout.tsx` injects `EmployeeLayout`; `(auth)` segment uses `AuthLayout`.
- TanStack Query keys are namespaced by domain (`['me','leave','balances']`).
- The `apiClient` for the employee app uses cookie-based auth; no `Authorization` header.
- All forms reuse the same `<FormField>` and shared Zod schemas in `packages/types/forms/*`.
- Responsive: tables degrade to card lists at `< md`; date pickers use the native input on mobile when supported (falls back to shadcn calendar on desktop and on iOS Safari).
