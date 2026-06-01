# 01 — Information Architecture

> **Status:** Phase 1. Defines every route, every screen, every navigation entry, every user flow, and the canonical RBAC matrix. The API spec (`03`) and UI specs (`05`, `06`) reference IDs declared here.

---

## 1. Application Topology

```
peopleflow.app  (marketing — out of scope for this spec)

admin.peopleflow.app    →  Next.js app  apps/admin   →  Admin Portal
app.peopleflow.app      →  Next.js app  apps/employee →  Employee Self-Service
api.peopleflow.app      →  NestJS app   apps/api      →  REST API + workers
```

In local dev, all three are reverse-proxied under `localhost:3000` paths (`/admin`, `/app`, `/api`) via Next.js rewrites; in production they are distinct hosts.

Shared authentication: a single Sign-In page on the apex; based on the user's primary role the API returns a `defaultPortal` (`admin` | `employee`) and the client redirects accordingly. A user with the right permissions can switch portals via a topbar control.

---

## 2. URL & Route Conventions

- **Plural collection / singular detail**: `/employees` (list), `/employees/[id]` (detail).
- **Nested actions** as sub-routes: `/employees/[id]/documents`, `/leave/requests/[id]/approve`.
- **Filter state** lives in the query string (`?status=pending&department=eng&page=2`) so links are shareable.
- **Slugs** for org-configurable resources (departments, leave types) when human-typed; **UUIDs** for everything else.
- **Stable canonical paths** — never break a route once shipped; redirect on rename.

---

## 3. Layouts

| Layout ID | Used by | Composition |
|---|---|---|
| `AuthLayout` | All `/auth/*` routes in both portals | Centered card, brand mark, no chrome. |
| `AdminLayout` | All admin authenticated routes | Sidebar (left, collapsible) + Topbar (search, notifications, org switcher, user menu) + Content. |
| `EmployeeLayout` | All employee authenticated routes | Sidebar (left, collapsible) + Topbar (notifications, user menu) + Content. |
| `BlankLayout` | Print views, public docs, error pages | No chrome. |
| `OnboardingLayout` | First-run wizard for new orgs | Stepper top, no sidebar. |

---

## 4. Admin Portal — Routes

> All routes below are inside `apps/admin`. Authentication is required for everything outside `/auth/*`. Each route lists the **screen ID** (referenced in `05-admin-portal.md`), the **permissions** required (see § 10 RBAC), and the **layout**.

### 4.1 Authentication & Public

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/auth/sign-in` | `A-AUTH-001` | AuthLayout | public | Email + password sign-in. |
| `/auth/forgot-password` | `A-AUTH-002` | AuthLayout | public | Request reset email. |
| `/auth/reset-password` | `A-AUTH-003` | AuthLayout | public (token) | Set new password from email link. |
| `/auth/two-factor` | `A-AUTH-004` | AuthLayout | post-login challenge | TOTP code entry. |
| `/auth/accept-invite` | `A-AUTH-005` | AuthLayout | public (token) | First-time setup for invited users. |

### 4.2 Onboarding (first run for a new org)

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/onboarding` | `A-ONB-001` | OnboardingLayout | `org.setup` (SuperAdmin) | Wizard: org profile → working hours → leave types → first employees. |

### 4.3 Core Application

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/` (redirects to `/dashboard`) | — | — | any admin role | — |
| `/dashboard` | `A-DASH-001` | AdminLayout | `dashboard.view` | Admin home dashboard. |

### 4.4 Employees

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/employees` | `A-EMP-001` | AdminLayout | `employee.read` | Employee list, filters, bulk actions. |
| `/employees/new` | `A-EMP-002` | AdminLayout | `employee.create` | Invite/onboard single employee. |
| `/employees/import` | `A-EMP-003` | AdminLayout | `employee.create` | CSV bulk import. |
| `/employees/[id]` | `A-EMP-010` | AdminLayout | `employee.read` | Employee detail — **Overview** tab. |
| `/employees/[id]/personal` | `A-EMP-011` | AdminLayout | `employee.read` | Personal info tab. |
| `/employees/[id]/employment` | `A-EMP-012` | AdminLayout | `employee.read` | Employment history tab. |
| `/employees/[id]/documents` | `A-EMP-013` | AdminLayout | `employee.documents.read` | Documents tab. |
| `/employees/[id]/leave` | `A-EMP-014` | AdminLayout | `leave.read` | Leave history & balances. |
| `/employees/[id]/attendance` | `A-EMP-015` | AdminLayout | `attendance.read` | Attendance history. |
| `/employees/[id]/edit` | `A-EMP-020` | AdminLayout | `employee.update` | Edit employee details. |

Sub-resources under settings (departments, designations, locations) are reached via the Settings nav, not Employees.

### 4.5 Attendance

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/attendance` | `A-ATT-001` | AdminLayout | `attendance.read` | Today's view — who's in / out / late. |
| `/attendance/history` | `A-ATT-002` | AdminLayout | `attendance.read` | Historical filterable view. |
| `/attendance/regularization` | `A-ATT-003` | AdminLayout | `attendance.approve` | Pending regularization requests. |
| `/attendance/reports` | `A-ATT-004` | AdminLayout | `attendance.read` | Monthly summary, exports. |

### 4.6 Leave

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/leave/requests` | `A-LV-001` | AdminLayout | `leave.read` | All requests, filterable (default = pending). |
| `/leave/requests/[id]` | `A-LV-002` | AdminLayout | `leave.read` | Request detail with approve/reject. |
| `/leave/calendar` | `A-LV-003` | AdminLayout | `leave.read` | Calendar of org leaves. |
| `/leave/balances` | `A-LV-004` | AdminLayout | `leave.read` | Per-employee balance table. |
| `/leave/types` | `A-LV-005` | AdminLayout | `leave.policy.read` | Leave types list. |
| `/leave/types/new` | `A-LV-006` | AdminLayout | `leave.policy.write` | Create leave type. |
| `/leave/types/[id]` | `A-LV-007` | AdminLayout | `leave.policy.read` | Edit leave type. |

### 4.7 Documents

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/documents` | `A-DOC-001` | AdminLayout | `document.read` | All documents. |
| `/documents/new` | `A-DOC-002` | AdminLayout | `document.create` | Upload & distribute. |
| `/documents/[id]` | `A-DOC-003` | AdminLayout | `document.read` | Document detail + ack tracking. |
| `/documents/categories` | `A-DOC-004` | AdminLayout | `document.category.write` | Manage categories. |

### 4.8 Announcements

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/announcements` | `A-ANN-001` | AdminLayout | `announcement.read` | List of all announcements. |
| `/announcements/new` | `A-ANN-002` | AdminLayout | `announcement.create` | Composer. |
| `/announcements/[id]` | `A-ANN-003` | AdminLayout | `announcement.read` | Detail + ack tracking. |
| `/announcements/[id]/edit` | `A-ANN-004` | AdminLayout | `announcement.update` | Edit (drafts/scheduled only). |

### 4.9 Holidays

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/holidays/calendars` | `A-HOL-001` | AdminLayout | `holiday.read` | List of calendars. |
| `/holidays/calendars/new` | `A-HOL-002` | AdminLayout | `holiday.write` | Create calendar. |
| `/holidays/calendars/[id]` | `A-HOL-003` | AdminLayout | `holiday.read` | Calendar detail + holidays list. |
| `/holidays/calendars/[id]/import` | `A-HOL-004` | AdminLayout | `holiday.write` | Bulk holiday import. |

### 4.10 Settings

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/settings/organization` | `A-SET-001` | AdminLayout | `org.settings.read` | Org profile, working hours, currency, tz. |
| `/settings/branding` | `A-SET-002` | AdminLayout | `org.settings.write` | Logo, primary color. |
| `/settings/departments` | `A-SET-010` | AdminLayout | `org.structure.read` | Departments list. |
| `/settings/designations` | `A-SET-011` | AdminLayout | `org.structure.read` | Designations / job titles. |
| `/settings/locations` | `A-SET-012` | AdminLayout | `org.structure.read` | Offices / locations. |
| `/settings/policies/leave` | `A-SET-020` | AdminLayout | `leave.policy.read` | Org-wide leave defaults. |
| `/settings/policies/attendance` | `A-SET-021` | AdminLayout | `attendance.policy.read` | Working hours, late thresholds. |
| `/settings/roles` | `A-SET-030` | AdminLayout | `rbac.read` | Roles & permissions. |
| `/settings/roles/[id]` | `A-SET-031` | AdminLayout | `rbac.write` | Edit role permissions. |
| `/settings/notifications` | `A-SET-040` | AdminLayout | `org.settings.read` | Notification preferences. |
| `/settings/audit-log` | `A-SET-050` | AdminLayout | `audit.read` | Audit log viewer. |
| `/settings/profile` | `A-SET-090` | AdminLayout | self | The signed-in admin's own profile (also via topbar). |

### 4.11 Misc

| Route | Screen ID | Layout | Purpose |
|---|---|---|---|
| `/notifications` | `A-NOT-001` | AdminLayout | Full notifications inbox. |
| `/search` | `A-SRC-001` | AdminLayout | Global search results page (for Cmd-K overflow). |
| `/403` | `A-ERR-403` | BlankLayout | Forbidden. |
| `/404` | `A-ERR-404` | BlankLayout | Not found. |
| `/500` | `A-ERR-500` | BlankLayout | Server error. |

---

## 5. Employee Portal — Routes

> All routes below are inside `apps/employee`. Authentication required outside `/auth/*`. The employee portal has a much smaller surface.

### 5.1 Authentication

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/auth/sign-in` | `E-AUTH-001` | AuthLayout | public | Sign-in (shared design w/ admin). |
| `/auth/forgot-password` | `E-AUTH-002` | AuthLayout | public | Request reset. |
| `/auth/reset-password` | `E-AUTH-003` | AuthLayout | public (token) | Reset. |
| `/auth/two-factor` | `E-AUTH-004` | AuthLayout | post-login challenge | TOTP. |
| `/auth/accept-invite` | `E-AUTH-005` | AuthLayout | public (token) | First-time setup. |

### 5.2 Core

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/` (redirects to `/dashboard`) | — | — | self | — |
| `/dashboard` | `E-DASH-001` | EmployeeLayout | self | Employee home. |

### 5.3 Profile

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/profile` | `E-PRO-001` | EmployeeLayout | self | Profile — Overview tab. |
| `/profile/personal` | `E-PRO-002` | EmployeeLayout | self | Personal info (edit allowed for self-managed fields). |
| `/profile/contacts` | `E-PRO-003` | EmployeeLayout | self | Emergency contacts CRUD. |
| `/profile/employment` | `E-PRO-004` | EmployeeLayout | self | Read-only employment history. |
| `/profile/documents` | `E-PRO-005` | EmployeeLayout | self | Personal documents shelf. |
| `/profile/security` | `E-PRO-006` | EmployeeLayout | self | Password change, 2FA. |

### 5.4 Attendance

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/attendance` | `E-ATT-001` | EmployeeLayout | self | Today's status + check in/out. |
| `/attendance/history` | `E-ATT-002` | EmployeeLayout | self | My attendance history. |
| `/attendance/regularize/new` | `E-ATT-003` | EmployeeLayout | self | Submit regularization. |
| `/attendance/regularize/[id]` | `E-ATT-004` | EmployeeLayout | self | View regularization request status. |

### 5.5 Leave

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/leave` | `E-LV-001` | EmployeeLayout | self | Balances + recent. |
| `/leave/apply` | `E-LV-002` | EmployeeLayout | self | Apply form. |
| `/leave/history` | `E-LV-003` | EmployeeLayout | self | My leave history. |
| `/leave/[id]` | `E-LV-004` | EmployeeLayout | self | Single request detail + cancel. |
| `/leave/calendar` | `E-LV-005` | EmployeeLayout | self | My + team calendar (configurable). |

### 5.6 Documents

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/documents` | `E-DOC-001` | EmployeeLayout | self | Inbox of assigned + personal docs. |
| `/documents/[id]` | `E-DOC-002` | EmployeeLayout | self | Read, ack, download. |
| `/documents/upload` | `E-DOC-003` | EmployeeLayout | self | Upload required doc (e.g., PAN). |

### 5.7 Announcements

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/announcements` | `E-ANN-001` | EmployeeLayout | self | Feed. |
| `/announcements/[id]` | `E-ANN-002` | EmployeeLayout | self | Detail + ack. |

### 5.8 Holidays

| Route | Screen ID | Layout | Permission | Purpose |
|---|---|---|---|---|
| `/holidays` | `E-HOL-001` | EmployeeLayout | self | Calendar of my applicable holidays. |

### 5.9 Misc

| Route | Screen ID | Purpose |
|---|---|---|
| `/notifications` | `E-NOT-001` | Inbox. |
| `/help` | `E-HLP-001` | Help & contact HR. |
| `/403`, `/404`, `/500` | `E-ERR-*` | Errors. |

---

## 6. Sidebar Navigation — Admin Portal

Order, grouping, and labels below are the canonical product spec. Items hidden when user lacks the listed permission.

```
─ Workspace ────────────────────────────
  ▸ Dashboard            /dashboard                  dashboard.view
─ People ───────────────────────────────
  ▸ Employees            /employees                  employee.read
─ Time ────────────────────────────────
  ▸ Attendance           /attendance                 attendance.read
      ├─ Today           /attendance
      ├─ History         /attendance/history
      ├─ Regularizations /attendance/regularization  attendance.approve   [badge: pending count]
      └─ Reports         /attendance/reports
  ▸ Leave                /leave/requests             leave.read           [badge: pending count]
      ├─ Requests        /leave/requests
      ├─ Calendar        /leave/calendar
      ├─ Balances        /leave/balances
      └─ Leave Types     /leave/types                leave.policy.read
  ▸ Holidays             /holidays/calendars         holiday.read
─ Communications ──────────────────────
  ▸ Announcements        /announcements              announcement.read
  ▸ Documents            /documents                  document.read
─ Configure ───────────────────────────
  ▸ Settings             /settings/organization      org.settings.read
      ├─ Organization
      ├─ Branding
      ├─ Departments
      ├─ Designations
      ├─ Locations
      ├─ Policies → Leave
      ├─ Policies → Attendance
      ├─ Roles & Permissions  rbac.read
      ├─ Notifications
      └─ Audit Log            audit.read
```

**Sidebar mechanics:**

- Collapsible (icons-only) for ≥ md screens; off-canvas on mobile.
- Active item highlighted; parent expanded if any child is active.
- Badge dots/counters on items with pending work (e.g., Leave Requests pending count).
- Section headers (`Workspace`, `People`, …) are non-clickable labels.

---

## 7. Sidebar Navigation — Employee Portal

```
  ▸ Dashboard            /dashboard
  ▸ My Profile           /profile
  ▸ Attendance           /attendance
  ▸ Leave                /leave
  ▸ Documents            /documents       [badge: unread/ack-pending]
  ▸ Announcements        /announcements   [badge: unread]
  ▸ Holidays             /holidays
  ▸ Help                 /help
```

Sidebar collapses to a bottom-tab bar on small mobile (< 480 px).

---

## 8. Topbar (both portals)

Left to right:

1. **Sidebar collapse/expand toggle** (md+).
2. **Global Search** (`Cmd/Ctrl + K`) — searches employees, documents, announcements (admin); searches docs, announcements, holidays (employee).
3. **Quick Action** button (admin only): "+ New" menu — Employee, Announcement, Holiday, Document.
4. **Notifications** bell with unread count.
5. **Portal Switcher** (visible only for users whose roles allow both portals).
6. **User Menu** — avatar with: My Profile, Theme (Light/Dark/System), Sign Out.

---

## 9. Screen Inventory (Master List)

> Detailed specs for each screen — fields, widgets, actions, validations, API calls — live in `05-admin-portal.md` and `06-employee-portal.md`. The IDs below are the canonical references.

### 9.1 Admin Portal

| ID | Name | Route |
|---|---|---|
| A-AUTH-001 | Sign In | `/auth/sign-in` |
| A-AUTH-002 | Forgot Password | `/auth/forgot-password` |
| A-AUTH-003 | Reset Password | `/auth/reset-password` |
| A-AUTH-004 | Two-Factor | `/auth/two-factor` |
| A-AUTH-005 | Accept Invite | `/auth/accept-invite` |
| A-ONB-001 | Onboarding Wizard | `/onboarding` |
| A-DASH-001 | Admin Dashboard | `/dashboard` |
| A-EMP-001 | Employees List | `/employees` |
| A-EMP-002 | Add Employee | `/employees/new` |
| A-EMP-003 | Import Employees | `/employees/import` |
| A-EMP-010 | Employee — Overview | `/employees/[id]` |
| A-EMP-011 | Employee — Personal | `/employees/[id]/personal` |
| A-EMP-012 | Employee — Employment | `/employees/[id]/employment` |
| A-EMP-013 | Employee — Documents | `/employees/[id]/documents` |
| A-EMP-014 | Employee — Leave | `/employees/[id]/leave` |
| A-EMP-015 | Employee — Attendance | `/employees/[id]/attendance` |
| A-EMP-020 | Employee Edit | `/employees/[id]/edit` |
| A-ATT-001 | Attendance — Today | `/attendance` |
| A-ATT-002 | Attendance — History | `/attendance/history` |
| A-ATT-003 | Regularization Inbox | `/attendance/regularization` |
| A-ATT-004 | Attendance Reports | `/attendance/reports` |
| A-LV-001 | Leave Requests | `/leave/requests` |
| A-LV-002 | Leave Request Detail | `/leave/requests/[id]` |
| A-LV-003 | Leave Calendar | `/leave/calendar` |
| A-LV-004 | Leave Balances | `/leave/balances` |
| A-LV-005 | Leave Types | `/leave/types` |
| A-LV-006 | Leave Type — New | `/leave/types/new` |
| A-LV-007 | Leave Type — Edit | `/leave/types/[id]` |
| A-DOC-001 | Documents List | `/documents` |
| A-DOC-002 | Document — Upload | `/documents/new` |
| A-DOC-003 | Document Detail | `/documents/[id]` |
| A-DOC-004 | Document Categories | `/documents/categories` |
| A-ANN-001 | Announcements List | `/announcements` |
| A-ANN-002 | Announcement Composer | `/announcements/new` |
| A-ANN-003 | Announcement Detail | `/announcements/[id]` |
| A-ANN-004 | Announcement Edit | `/announcements/[id]/edit` |
| A-HOL-001 | Calendars List | `/holidays/calendars` |
| A-HOL-002 | Calendar — New | `/holidays/calendars/new` |
| A-HOL-003 | Calendar Detail | `/holidays/calendars/[id]` |
| A-HOL-004 | Calendar — Bulk Import | `/holidays/calendars/[id]/import` |
| A-SET-001 | Settings — Organization | `/settings/organization` |
| A-SET-002 | Settings — Branding | `/settings/branding` |
| A-SET-010 | Settings — Departments | `/settings/departments` |
| A-SET-011 | Settings — Designations | `/settings/designations` |
| A-SET-012 | Settings — Locations | `/settings/locations` |
| A-SET-020 | Policies — Leave | `/settings/policies/leave` |
| A-SET-021 | Policies — Attendance | `/settings/policies/attendance` |
| A-SET-030 | Roles & Permissions | `/settings/roles` |
| A-SET-031 | Role Editor | `/settings/roles/[id]` |
| A-SET-040 | Notification Settings | `/settings/notifications` |
| A-SET-050 | Audit Log | `/settings/audit-log` |
| A-SET-090 | My Admin Profile | `/settings/profile` |
| A-NOT-001 | Notifications Inbox | `/notifications` |
| A-SRC-001 | Search Results | `/search` |
| A-ERR-403 / 404 / 500 | Errors | — |

### 9.2 Employee Portal

| ID | Name | Route |
|---|---|---|
| E-AUTH-001 | Sign In | `/auth/sign-in` |
| E-AUTH-002 | Forgot Password | `/auth/forgot-password` |
| E-AUTH-003 | Reset Password | `/auth/reset-password` |
| E-AUTH-004 | Two-Factor | `/auth/two-factor` |
| E-AUTH-005 | Accept Invite | `/auth/accept-invite` |
| E-DASH-001 | Employee Dashboard | `/dashboard` |
| E-PRO-001 | Profile Overview | `/profile` |
| E-PRO-002 | Personal Info | `/profile/personal` |
| E-PRO-003 | Emergency Contacts | `/profile/contacts` |
| E-PRO-004 | Employment History | `/profile/employment` |
| E-PRO-005 | Personal Documents | `/profile/documents` |
| E-PRO-006 | Security | `/profile/security` |
| E-ATT-001 | Attendance Today | `/attendance` |
| E-ATT-002 | Attendance History | `/attendance/history` |
| E-ATT-003 | Regularize — New | `/attendance/regularize/new` |
| E-ATT-004 | Regularize — Detail | `/attendance/regularize/[id]` |
| E-LV-001 | Leave Home | `/leave` |
| E-LV-002 | Apply for Leave | `/leave/apply` |
| E-LV-003 | Leave History | `/leave/history` |
| E-LV-004 | Leave Detail | `/leave/[id]` |
| E-LV-005 | Leave Calendar | `/leave/calendar` |
| E-DOC-001 | Documents Inbox | `/documents` |
| E-DOC-002 | Document Detail | `/documents/[id]` |
| E-DOC-003 | Upload Document | `/documents/upload` |
| E-ANN-001 | Announcements Feed | `/announcements` |
| E-ANN-002 | Announcement Detail | `/announcements/[id]` |
| E-HOL-001 | Holidays Calendar | `/holidays` |
| E-NOT-001 | Notifications Inbox | `/notifications` |
| E-HLP-001 | Help | `/help` |
| E-ERR-* | Errors | — |

---

## 10. RBAC — Roles & Permissions

### 10.1 Default Roles (per organization)

| Role key | Display | Description | Notes |
|---|---|---|---|
| `super_admin` | Super Admin | Org owner. Manages billing (future), all settings, all data. | Always at least one; cannot be deleted if last. |
| `hr_admin` | HR Admin | Full HR ops; cannot manage roles or billing. | Default for HR staff. |
| `manager` | Manager | (Phase 2 placeholder) — exists but has no extra perms in Phase 1. | Reserved. |
| `employee` | Employee | Self-service only. | Default for everyone. |

Custom roles allowed in Phase 1 (Settings → Roles), built by toggling permissions.

### 10.2 Permission Catalog

Permissions follow `resource.action` naming. Action vocabulary: `read`, `create`, `update`, `delete`, `approve`, `export`, `import`, plus resource-specific (`policy.read`, `policy.write`).

```
# Dashboards
dashboard.view

# Org
org.setup
org.settings.read
org.settings.write
org.structure.read       # departments, designations, locations
org.structure.write

# Users / RBAC
rbac.read
rbac.write

# Employees
employee.read
employee.create
employee.update
employee.delete
employee.invite
employee.import
employee.export
employee.documents.read
employee.documents.write

# Attendance
attendance.read           # own scope determined by role at runtime: admin = all, employee = self
attendance.write          # check-in / regularization submit
attendance.approve        # approve regularizations
attendance.policy.read
attendance.policy.write
attendance.export

# Leave
leave.read
leave.create              # apply for self
leave.update              # edit own pending
leave.cancel
leave.approve
leave.reject
leave.policy.read
leave.policy.write
leave.balance.adjust      # admin manual ledger adjustment
leave.export

# Documents
document.read
document.create
document.update
document.delete
document.acknowledge
document.category.read
document.category.write

# Announcements
announcement.read
announcement.create
announcement.update
announcement.delete
announcement.publish
announcement.acknowledge

# Holidays
holiday.read
holiday.write

# Audit
audit.read
```

### 10.3 Permission Matrix (default assignments)

| Permission | super_admin | hr_admin | manager (P1) | employee |
|---|:-:|:-:|:-:|:-:|
| `dashboard.view` (admin dashboard) | ✓ | ✓ | — | — |
| `org.setup` | ✓ | — | — | — |
| `org.settings.read` | ✓ | ✓ | — | — |
| `org.settings.write` | ✓ | — | — | — |
| `org.structure.read` | ✓ | ✓ | — | — |
| `org.structure.write` | ✓ | ✓ | — | — |
| `rbac.read` | ✓ | — | — | — |
| `rbac.write` | ✓ | — | — | — |
| `employee.read` | ✓ | ✓ | scoped (team) | self |
| `employee.create / update / delete / invite / import / export` | ✓ | ✓ | — | — |
| `employee.documents.read / write` | ✓ | ✓ | — | self |
| `attendance.read` | ✓ | ✓ | scoped | self |
| `attendance.write` | ✓ | ✓ | self | self |
| `attendance.approve` | ✓ | ✓ | scoped | — |
| `attendance.policy.*` | ✓ | ✓ (read) | — | — |
| `attendance.export` | ✓ | ✓ | — | — |
| `leave.read` | ✓ | ✓ | scoped | self |
| `leave.create / update / cancel` | ✓ | ✓ | self | self |
| `leave.approve / reject` | ✓ | ✓ | scoped | — |
| `leave.policy.*` | ✓ | ✓ | — | — |
| `leave.balance.adjust` | ✓ | ✓ | — | — |
| `document.read` | ✓ | ✓ | scoped | assigned |
| `document.create / update / delete` | ✓ | ✓ | — | — |
| `document.acknowledge` | ✓ | ✓ | self | self |
| `document.category.*` | ✓ | ✓ | — | — |
| `announcement.read` | ✓ | ✓ | ✓ | ✓ |
| `announcement.create / update / delete / publish` | ✓ | ✓ | — | — |
| `announcement.acknowledge` | ✓ | ✓ | ✓ | ✓ |
| `holiday.read` | ✓ | ✓ | ✓ | ✓ |
| `holiday.write` | ✓ | ✓ | — | — |
| `audit.read` | ✓ | — | — | — |

> *Scoped* in Phase 1 = the manager role exists with no scoping powers; treat as `—` for runtime checks. The column is preserved so Phase 2 wires it in without schema changes.

### 10.4 Scope Modifiers

A permission grant is paired with an implicit **scope** computed by the guard:

- **`global`** — applies across the entire organization (admin roles).
- **`team`** — limited to employees whose `manager_id` chain includes the principal (Phase 2).
- **`self`** — limited to `principal.employee_id == resource.employee_id`.
- **`assigned`** — used for documents/announcements: limited to records whose audience targets the principal.

Scope is resolved server-side in the Authorization layer; the client merely gates UI visibility based on the boolean "can the user perform action X on any resource?"

### 10.5 Cross-Tenant Guard

Independent of RBAC, every request is bound to a single `organization_id` derived from the JWT. The Prisma layer injects this scope automatically — any record fetched/changed across tenants results in a 404. RBAC is layered **inside** this tenant boundary.

---

## 11. User Flows

Each flow lists the actor, trigger, steps, system events (📩 = notification, 🗃️ = audit), and exit states.

### 11.1 Flow: Sign Up a New Organization (out-of-product → in-product handoff)

> Phase 1 assumption: sign-up happens via a public marketing page that POSTs to `/api/v1/auth/sign-up`. The product opens on the **Onboarding Wizard**.

1. User submits sign-up form (org name, full name, email, password).
2. API creates `organizations` row + initial `users` row with role `super_admin` + initial `employees` row linked to the user (status `active`).
3. 📩 Verify-email link sent.
4. User clicks link → email verified → redirected to `/onboarding`.
5. Wizard: Step 1 Org profile → Step 2 Working hours → Step 3 Default leave types (pre-seeded but editable) → Step 4 Holiday calendar (optional import) → Step 5 Invite first employees.
6. Wizard exit → `/dashboard` with a "Getting started" checklist widget.

### 11.2 Flow: Invite an Employee

1. Admin opens `/employees/new`.
2. Fills form (see `05-admin-portal.md` § A-EMP-002).
3. On submit: `employees` row created with `status=invited`, `users` row created with `status=invited` and a one-time invite token (expires 7 days).
4. 📩 Invite email sent with `/auth/accept-invite?token=…`.
5. Employee clicks link → sets password → optional 2FA → lands on Employee `/dashboard`.
6. 🗃️ Audit log entries: `employee.create`, `user.invite`, `user.accept`.

### 11.3 Flow: Apply for Leave (Employee → Admin Approval)

1. Employee opens `/leave/apply`.
2. Selects leave type → date range → reason. Client validates against current balance (`GET /me/leave-balances`) and policy (min/max days, blackout dates) before allowing submit.
3. Submit → `leave_requests` row `status=pending`, leave balance is **reserved** (held but not deducted; ledger holds entry `intent=reserve`).
4. 📩 Email + in-app notification to HR Admins.
5. Admin opens `/leave/requests/[id]`:
   - Reviews context: balances, overlapping team leaves, recent attendance.
   - Action: **Approve** / **Reject** (with optional comment).
6. On Approve: balance ledger entry switches `intent=deduct`. `leave_requests.status=approved`. 📩 Employee notified.
7. On Reject: reservation released. `status=rejected`. 📩 Employee notified.
8. Employee can **Cancel** while `pending` or **Withdraw** if `approved` but not yet started — withdrawal releases ledger.
9. 🗃️ Audit log entries at each state change.

### 11.4 Flow: Attendance Check-in / Check-out

1. Employee opens `/attendance` (or uses dashboard widget).
2. Press **Check In** → captures timestamp (server-side), optional IP / user-agent.
3. `attendance_records` row created/updated for today.
4. Press **Check Out** at day end → record updated; worked hours computed.
5. If the employee forgets to check out, an end-of-day job marks the record `incomplete`. Employee can submit a Regularization (see 11.5).
6. 🗃️ Audit log entries: `attendance.check_in`, `attendance.check_out`.

### 11.5 Flow: Attendance Regularization

1. Employee notices a missing/incorrect record → `/attendance/regularize/new`.
2. Form: date, requested check-in, requested check-out, reason. Validations: cannot regularize dates > 14 days ago (configurable per org policy), cannot regularize already-approved records.
3. Submit → `attendance_regularization_requests` row `status=pending`.
4. 📩 Notify HR Admins.
5. Admin reviews at `/attendance/regularization` → approves/rejects.
6. On approve: corresponding `attendance_records` row updated, `is_regularized=true`, `regularization_id` set.
7. 🗃️ Audit log.

### 11.6 Flow: Publish an Announcement

1. Admin opens `/announcements/new`.
2. Composes title, body (rich text), audience (All employees / specific departments / specific locations / specific employees), optional schedule_at, optional acknowledgment_required.
3. **Save as Draft** or **Publish**.
4. On Publish (immediate or scheduled): announcement becomes visible to its audience.
5. 📩 Notifications fan out to audience.
6. Employee reads announcement, clicks "Acknowledge" if required → `announcement_acknowledgments` row inserted.
7. Admin views `/announcements/[id]` → real-time ack progress bar + un-acked list.

### 11.7 Flow: Upload & Distribute Document

1. Admin opens `/documents/new`.
2. Selects category, uploads file (presigned S3), sets audience, sets ack-required flag and due-by date.
3. On Publish: document becomes visible to audience; if `is_required` and `due_by` set, due-date countdown shows in employee inbox.
4. 📩 Notifications.
5. Employee opens `/documents/[id]` → previews/downloads → clicks Acknowledge if required.
6. Admin can see acknowledgment progress.

### 11.8 Flow: First-Time Login (Invited User)

1. User clicks invite link → `/auth/accept-invite?token=…`.
2. Token validated; if expired → resend link CTA.
3. User sets password (zxcvbn ≥ 3) → optional 2FA TOTP setup → recovery codes shown once.
4. `users.status` → `active`; `employees.status` → `active`.
5. Redirect to `/dashboard`.

### 11.9 Flow: Password Reset

1. `/auth/forgot-password` → enter email → response is always 200 (no enumeration).
2. If email known and active: 📩 reset link with token (TTL 60 min, single use).
3. `/auth/reset-password?token=…` → set new password.
4. All sessions invalidated; user re-signs in.

### 11.10 Flow: Deactivate an Employee

1. Admin → `/employees/[id]/edit` → **Deactivate** action.
2. Modal: confirm last working day, choice for "Cancel pending leaves?" (default yes).
3. `employees.status=offboarded`, `employees.terminated_on=date`, `users.status=disabled`. Active sessions revoked. Pending leaves auto-cancelled.
4. The record remains visible in lists with an "Offboarded" filter; soft-delete keeps full history.
5. 🗃️ Audit log.

---

## 12. Dashboard Widget Catalog (high-level)

> Detailed implementation, query, and copy for each widget appears in `05-admin-portal.md` § Dashboard and `06-employee-portal.md` § Dashboard. This is the canonical name list referenced elsewhere.

### Admin

- **HeadcountWidget** — total active employees + delta vs last month.
- **PresentTodayWidget** — present / absent / on-leave counts.
- **PendingApprovalsWidget** — leave + regularization counts.
- **UpcomingHolidaysWidget** — next 5.
- **BirthdaysAnniversariesWidget** — this week.
- **NewHiresWidget** — last 30 days.
- **AttritionWidget** — last 30 days; offboardings.
- **RecentAnnouncementsWidget** — last 3 published.
- **AcknowledgmentComplianceWidget** — % docs/announcements acked.
- **QuickActionsWidget** — buttons: New Employee, New Announcement, New Holiday, Bulk Import.
- **GettingStartedChecklistWidget** — visible until 100% complete, then auto-hides.

### Employee

- **TodayStatusWidget** — check-in/out + worked hours.
- **MyLeaveBalanceWidget** — top 3 leave types with balance.
- **MyNextLeaveWidget** — next upcoming approved leave.
- **PendingTasksWidget** — un-acked documents + announcements + pending regularizations.
- **AnnouncementsWidget** — last 3.
- **UpcomingHolidaysWidget** — next 3.
- **TeamBirthdaysWidget** — this week within department.
- **QuickActionsWidget** — Apply Leave, Regularize, Upload Document.

---

## 13. Forms & Validation — Conventions

All forms in both portals follow these rules (concrete fields per form in `05` and `06`):

1. **Schema:** every form has a Zod schema in `packages/types/forms/*` shared between client and server.
2. **Field components:** standard `<FormField>` wraps shadcn `Input`, `Select`, `Combobox`, `Textarea`, `DatePicker`, `DateRangePicker`, `FileDropzone`, `Switch`, `Checkbox`, `RadioGroup`, `RichTextEditor`.
3. **Required fields** marked with subtle `*`. Disabled fields have explanatory tooltip.
4. **Inline validation** fires on blur; submit-validation fires on submit. Errors shown below field in danger color; field aria-invalid.
5. **Submit affordance:** primary button label is verb + noun ("Save changes", "Send invite", "Publish announcement"). Loading state shows spinner + same label.
6. **Optimistic update** allowed when server roundtrip > 500 ms expected; rollback toast on failure.
7. **Auto-save** for long forms (announcement composer): debounced draft save every 2 s of inactivity.
8. **Confirm-on-leave** if dirty + unsaved.
9. **Server errors** with `code` + `message` mapped to field where possible (e.g., `email.taken` → highlight email field).

Validation conventions (zod primitives reused):

| Field type | Rules |
|---|---|
| Email | RFC-5322 short-list, lowercase normalized, ≤ 254 chars. |
| Password | Min 10, must contain 1 letter + 1 digit; zxcvbn score ≥ 3. |
| Phone | E.164 with country code; libphonenumber-js validation. |
| Name (first/last) | 1–60 chars, allow Unicode letters/marks/spaces/hyphens. |
| Employee code | 1–32 chars, alnum + `-` `_`, unique per org. |
| Date | ISO-8601; range checks via `superRefine`. |
| Date range | start ≤ end; max span configurable. |
| File | type allowlist per context; size ≤ 25 MB; client-side MIME sniff + server confirm. |
| Currency | non-negative; precision 2; ISO 4217 currency code. |
| Rich text | sanitized server-side (DOMPurify equivalent) to allowlist of tags. |

---

## 14. Notification Catalog (Phase 1)

| Event | Channels | Recipients | Template ID |
|---|---|---|---|
| User invited | Email | invitee | `tpl.invite` |
| Invite accepted | In-app | inviter | `tpl.invite.accepted` |
| Password reset requested | Email | self | `tpl.reset` |
| Password changed | Email | self | `tpl.password.changed` |
| Leave request submitted | Email + In-app | HR Admins (+ manager P2) | `tpl.leave.submitted` |
| Leave request approved | Email + In-app | requester | `tpl.leave.approved` |
| Leave request rejected | Email + In-app | requester | `tpl.leave.rejected` |
| Leave cancelled by employee | In-app | HR Admins | `tpl.leave.cancelled` |
| Regularization submitted | Email + In-app | HR Admins | `tpl.reg.submitted` |
| Regularization decided | Email + In-app | requester | `tpl.reg.decided` |
| Announcement published | Email (optional) + In-app | audience | `tpl.ann.published` |
| Announcement ack reminder (24h, 72h) | In-app | non-ackers | `tpl.ann.remind` |
| Document assigned (required) | Email + In-app | assignees | `tpl.doc.assigned` |
| Document ack reminder | In-app | non-ackers | `tpl.doc.remind` |
| Holiday calendar updated | In-app | assignees | `tpl.holiday.updated` |
| Birthday/anniversary digest | In-app | org channel (dashboard widget) | `tpl.birthday` |

Per-user opt-out for non-critical notifications (announcements, reminders) via `/settings/notifications` (admin) and `/profile/security` (employee).

---

## 15. Empty / Loading / Error State Inventory

Every list and dashboard widget must define three states. Canonical patterns:

| State | Spec |
|---|---|
| **Loading** | Skeleton matching the final layout; ≥ 300 ms before showing to avoid flicker. |
| **Empty (cold)** | Icon + 1-line headline + 1-line subtext + primary CTA. Tone is helpful, not apologetic. |
| **Empty (filtered)** | Same scaffold but: "No results for your filters" + Clear filters button. |
| **Error** | Inline banner; "Try again" button; copy never blames the user. |
| **Forbidden** | 403 page with a way back; never reveal resource existence. |

Specific empty-state copy and CTAs live with each screen spec.

---

## 16. Search Surfaces

| Surface | Sources searched | Trigger |
|---|---|---|
| Admin Cmd-K | employees, documents, announcements, settings pages (static) | `⌘K` / `Ctrl K` |
| Employee Cmd-K | documents, announcements, holidays, my-profile sections | `⌘K` / `Ctrl K` |
| Employees list | name, email, employee_code, department, designation | inline filter bar |
| Documents list | title, category, audience | inline filter bar |

Search is server-backed (Postgres trigram + tsvector indexes) in Phase 1; full Meilisearch in Phase 2 if needed.

---

## 17. Internationalization Skeleton

Even though Phase 1 ships English-only:

- All UI strings live in `packages/i18n/locales/en.json`, referenced via `t('key')`.
- Dates rendered via `date-fns` with locale plug-in.
- Currencies via `Intl.NumberFormat`.
- Numbers via `Intl.NumberFormat`.
- Pluralization via ICU MessageFormat-compatible loader.
- RTL not actively supported in Phase 1 but Tailwind logical properties used (`ms-*`, `me-*`).

---

## 18. Future Expansion (sketch — full plan in 07)

The IA is built to absorb the following without restructuring:

- **Manager role** with team scope: requires sidebar items already permission-gated; no new top-level nav.
- **Payroll**: a new top-level group "Pay" with `/payroll/runs`, `/payroll/components`, `/payroll/payslips`.
- **Performance**: top-level "Performance" with reviews, goals, 1:1s.
- **Recruitment**: new portal `careers.peopleflow.app` + admin `/recruit/*`.
- **Expense**: top-level "Expenses".
- **Mobile apps**: consume the same `/api/v1`; design tokens already shared.
