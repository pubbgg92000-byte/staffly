# 03 — REST API Specification

> **Status:** Phase 3. Defines every HTTP endpoint, request/response envelope, error codes, and conventions. Entities referenced here are defined in `02-database-design.md`; permissions are from `01-information-architecture.md § 10`.

---

## 1. Conventions

### 1.1 Base URL & versioning

- **Production:** `https://api.peopleflow.app/api/v1`
- **Local dev:** `http://localhost:4000/api/v1`
- **Versioning:** path-based (`/api/v1`). New major version when breaking changes ship; minor/patch via additive fields and `Sunset` headers for deprecations (90-day window).

### 1.2 Authentication

- **JWT access token** (15 min) carried in:
  - HTTP-only secure cookie `pf_access` (browser portals), **and/or**
  - `Authorization: Bearer <token>` (machine clients).
- **Refresh token** (7d, rotating) in HTTP-only cookie `pf_refresh`.
- **CSRF:** double-submit token (`X-CSRF-Token` header matched against `pf_csrf` cookie) for all non-GET state-changing routes when the client uses cookies.

### 1.3 Tenancy

Every authenticated request resolves an `organizationId` from the JWT claim `org_id`. The tenant guard enforces this on every read/write. There is **no** way to act across tenants via the public API.

### 1.4 Standard response envelope

Successful response:
```json
{
  "data": <T or T[]>,
  "meta": { "page": 1, "limit": 20, "total": 137, "has_next_page": true }
}
```

Empty success (e.g., 204 endpoints) returns no body.

Errors:
```json
{
  "errors": [
    {
      "code": "validation.required",
      "message": "Field is required",
      "field": "first_name",
      "details": {}
    }
  ],
  "request_id": "req_01HABCDXYZ..."
}
```

### 1.5 Pagination

- Cursor-based for high-traffic lists (audit logs, notifications):
  `?cursor=<opaque>&limit=20`. Response meta includes `next_cursor`.
- Offset-based for everything else: `?page=1&limit=20`. Max `limit=100`.

### 1.6 Filtering

- Equality: `?status=pending`
- Multi-value: `?status=pending,approved`
- Range: `?created_from=2026-01-01&created_to=2026-01-31`
- Text search: `?q=marie`
- Boolean: `?is_active=true`

### 1.7 Sorting

- `?sort=created_at,-name` — fields, `-` prefix for descending. Server allowlists per endpoint.

### 1.8 Field selection

- `?fields=id,first_name,last_name` — server allowlists per endpoint.

### 1.9 Idempotency

- All POST endpoints accept `Idempotency-Key: <uuid>` header. The server caches `(key, route, user)` → response for 24 h.

### 1.10 Rate limits

- Anonymous: 60 req/min/IP.
- Authenticated employee: 600 req/min/user.
- Authenticated admin: 1200 req/min/user.
- Auth endpoints stricter: `/auth/sign-in` 10/min/IP + 5/min/email; `/auth/forgot-password` 5/h/email.
- Returned headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.

### 1.11 Error codes (catalog)

| HTTP | Code prefix | Meaning |
|---|---|---|
| 400 | `validation.*` | Malformed body / missing or invalid field |
| 401 | `auth.unauthenticated` | No or invalid auth |
| 401 | `auth.token_expired` | Access expired — refresh |
| 401 | `auth.two_factor_required` | 2FA challenge pending |
| 403 | `auth.forbidden` | Missing permission |
| 403 | `auth.tenant_boundary` | Cross-tenant access attempt |
| 404 | `not_found` | Resource missing or out of scope |
| 409 | `conflict.*` | State conflict (e.g., `conflict.email_taken`) |
| 422 | `domain.*` | Business-rule violation (e.g., `domain.leave_insufficient_balance`) |
| 423 | `account.locked` | Login lock-out |
| 429 | `rate_limited` | Too many requests |
| 500 | `internal` | Unhandled |
| 503 | `service_unavailable` | Maintenance / dependency down |

### 1.12 Webhooks (sketch — Phase 2)

Reserved namespace: `/webhooks/v1/*` for outbound webhooks. Not implemented in Phase 1.

### 1.13 Common types referenced below

| Type | Shape |
|---|---|
| `UUID` | string (36-char) |
| `Date` | `YYYY-MM-DD` |
| `DateTime` | RFC 3339, UTC, suffix `Z` |
| `Money` | `{ "amount": "12345.67", "currency": "USD" }` |
| `FileRef` | `{ "url": "<signed-or-key>", "name": "...", "mime_type": "...", "size_bytes": 12345 }` |
| `Audience` | `{ "kind": "all_employees" \| "department" \| "location" \| "designation" \| "employment_type" \| "employee", "values": [<id-or-enum>] }` |
| `PageMeta` | `{ "page", "limit", "total", "has_next_page" }` |
| `CursorMeta` | `{ "next_cursor", "limit", "has_next_page" }` |

---

## 2. Auth APIs

### 2.1 `POST /auth/sign-up`

Create a new tenant (org + super_admin user). Public.

**Body**
```json
{
  "organization_name": "Acme Inc",
  "slug": "acme",
  "full_name": "Priya Sharma",
  "email": "priya@acme.com",
  "password": "********",
  "country": "IN",
  "timezone": "Asia/Kolkata",
  "currency": "INR"
}
```

**201 Response**
```json
{
  "data": {
    "organization": { "id": "...", "slug": "acme" },
    "user": { "id": "...", "email": "priya@acme.com" },
    "must_verify_email": true
  }
}
```

**Errors:** `validation.*`, `conflict.email_taken`, `conflict.slug_taken`.

### 2.2 `POST /auth/sign-in`

**Body**
```json
{ "email": "priya@acme.com", "password": "********" }
```

**200 Response**
```json
{
  "data": {
    "user": { "id": "...", "email": "...", "default_portal": "admin" },
    "organization": { "id": "...", "slug": "acme", "primary_color": "..." },
    "two_factor_required": false
  }
}
```
Sets cookies `pf_access`, `pf_refresh`, `pf_csrf`.

**Errors:** `validation.*`, `auth.unauthenticated`, `account.locked`, `auth.two_factor_required` (200 with `two_factor_required:true` and a short-lived `pf_2fa_challenge` cookie).

### 2.3 `POST /auth/two-factor/verify`

Body: `{ "code": "123456" }`. On success, completes the sign-in and sets cookies. **Errors:** `validation.*`, `auth.unauthenticated`.

### 2.4 `POST /auth/refresh`

Reads `pf_refresh` cookie, rotates it, issues a new access token. **204** on success with new cookies. **Errors:** `auth.unauthenticated`.

### 2.5 `POST /auth/logout`

Revokes the current refresh chain; clears cookies. **204**.

### 2.6 `POST /auth/logout-all`

Revokes every active refresh token for the user; clears cookies. **204**.

### 2.7 `GET /auth/me`

Returns the authenticated user + employee + roles + permissions for client-side gating.

**200**
```json
{
  "data": {
    "user": { "id": "...", "email": "...", "preferences": { "theme": "system" }, "default_portal": "admin", "two_factor_enabled": true },
    "employee": { "id": "...", "display_name": "Priya Sharma", "profile_photo_url": null, "department_id": "...", "location_id": "...", "timezone": "Asia/Kolkata" },
    "organization": { "id": "...", "slug": "acme", "name": "Acme Inc", "primary_color": "#0F172A", "logo_url": null, "currency": "INR", "timezone": "Asia/Kolkata" },
    "roles": ["hr_admin"],
    "permissions": ["employee.read", "employee.create", "leave.approve", "..."]
  }
}
```

### 2.8 `POST /auth/forgot-password`

Body: `{ "email": "..." }`. **204** always (no enumeration).

### 2.9 `POST /auth/reset-password`

Body: `{ "token": "...", "new_password": "..." }`. Validates token, sets password, revokes all sessions. **204**.

### 2.10 `POST /auth/change-password`

Authenticated. Body: `{ "current_password": "...", "new_password": "..." }`. **204**. **Errors:** `auth.unauthenticated`, `validation.*`.

### 2.11 `POST /auth/2fa/enroll`

Authenticated. Returns provisioning URI + base32 secret (one-time).

**200**
```json
{ "data": { "otpauth_uri": "otpauth://totp/...", "secret": "JBSW...", "qr_data_url": "data:image/png;base64,..." } }
```

### 2.12 `POST /auth/2fa/activate`

Body: `{ "code": "123456" }`. On success returns recovery codes (shown once).

**200**
```json
{ "data": { "recovery_codes": ["abc-123", "def-456", ...] } }
```

### 2.13 `POST /auth/2fa/disable`

Body: `{ "password": "..." }`. **204**.

### 2.14 `GET /auth/invite/:token` — peek

Public. Returns invite details (org name, email, name) so the accept page can render.

### 2.15 `POST /auth/invite/accept`

Body: `{ "token": "...", "password": "...", "first_name?": "...", "last_name?": "..." }`. Marks user active, issues cookies.

---

## 3. Organization & Settings

### 3.1 `GET /organization`

Auth: `org.settings.read`.

**200**: org row (fields per `02 § 2.1.1`).

### 3.2 `PATCH /organization`

Auth: `org.settings.write`. Body: partial of `name, legal_name, domain, primary_color, timezone, locale, currency, week_start, billing_email`.

### 3.3 `POST /organization/logo`

Auth: `org.settings.write`. Multipart-free flow: client requests presign via `/files/presign` then calls this with `{ "key": "...", "name": "...", "mime_type": "...", "size_bytes": 123 }`.

### 3.4 `GET /organization/settings`

Returns all `org_settings` rows as a flat object.

**200**
```json
{ "data": { "attendance.late_threshold_minutes": 15, "leave.year_start": { "month": 1, "day": 1 }, "...": "..." } }
```

### 3.5 `PATCH /organization/settings`

Body: subset of the same map. Server validates per-key schema.

### 3.6 `GET /policies/attendance`

List attendance policies. Auth `attendance.policy.read`.

### 3.7 `POST /policies/attendance`

Create. Auth `attendance.policy.write`. Body: all fields except generated.

### 3.8 `PATCH /policies/attendance/:id` / `DELETE /policies/attendance/:id`

Standard.

### 3.9 `POST /policies/attendance/:id/set-default`

Promotes to default; un-defaults others atomically. **204**.

### 3.10 Notification preferences (org-level defaults)

`GET /organization/notifications` / `PATCH /organization/notifications` — toggles per template ID.

---

## 4. RBAC

### 4.1 `GET /rbac/permissions`

Returns the global permission catalog (`02 § 2.1.6`).

**200**
```json
{ "data": [{ "key": "employee.read", "resource": "employee", "action": "read", "description": "..." }] }
```

### 4.2 `GET /rbac/roles`

Auth `rbac.read`. List of roles in this org with assigned permissions.

### 4.3 `POST /rbac/roles`

Auth `rbac.write`. Body: `{ "key": "ops_lead", "name": "Ops Lead", "description": "...", "permissions": [{ "key": "leave.read", "scope": "global" }] }`.

### 4.4 `PATCH /rbac/roles/:id` / `DELETE /rbac/roles/:id`

Cannot delete system roles or roles with assigned users (move users first).

### 4.5 `GET /rbac/roles/:id/permissions` / `PUT /rbac/roles/:id/permissions`

PUT replaces the full permission set on the role.

### 4.6 `POST /users/:id/roles`

Auth `rbac.write`. Body: `{ "role_ids": ["..."] }`. Replaces user's roles.

---

## 5. Employees

### 5.1 `GET /employees`

Auth `employee.read`. Scope: `global` for admins, `self` for employees (returns only their own record).

**Query**: `?q=&status=&department_id=&location_id=&designation_id=&employment_type=&manager_id=&page=&limit=&sort=`. Allowed sort: `display_name`, `joined_on`, `created_at`.

**200**
```json
{
  "data": [
    {
      "id": "...",
      "employee_code": "ACM-021",
      "display_name": "Maria Garcia",
      "work_email": "maria@acme.com",
      "status": "active",
      "department": { "id": "...", "name": "Engineering" },
      "designation": { "id": "...", "name": "Senior Engineer" },
      "location": { "id": "...", "name": "Bangalore HQ" },
      "manager": { "id": "...", "display_name": "Priya Sharma" },
      "profile_photo_url": null,
      "joined_on": "2024-04-12"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 137, "has_next_page": true }
}
```

### 5.2 `POST /employees`

Auth `employee.create`. Body (subset for invite):
```json
{
  "first_name": "Maria",
  "last_name": "Garcia",
  "work_email": "maria@acme.com",
  "employee_code": "ACM-021",
  "department_id": "...",
  "designation_id": "...",
  "location_id": "...",
  "manager_id": "...",
  "employment_type": "full_time",
  "joined_on": "2024-04-12",
  "send_invite": true
}
```
**201**: full employee record.

**Errors:** `validation.*`, `conflict.email_taken`, `conflict.employee_code_taken`.

### 5.3 `GET /employees/:id`

Auth `employee.read` (admin) or self.

**200**: employee row + linked `department`, `designation`, `location`, `manager` (compact), `user` (compact), `current_employment` (latest `employments` row).

### 5.4 `PATCH /employees/:id`

Auth `employee.update` (admin) or self for the self-editable subset (personal contacts, profile photo, addresses).

### 5.5 `POST /employees/:id/deactivate`

Body: `{ "terminated_on": "2026-06-30", "cancel_pending_leaves": true, "reason": "..." }`. **200**.

### 5.6 `POST /employees/:id/reactivate`

**200**.

### 5.7 `POST /employees/:id/invite-resend`

**204**.

### 5.8 `GET /employees/:id/employments`

Returns history rows (newest first).

### 5.9 `POST /employees/:id/employments`

Body: an `employments` row. Server closes the previous open row (`effective_to = effective_from - 1 day`). **201**.

### 5.10 `GET /employees/:id/emergency-contacts` / `POST` / `PATCH /:contactId` / `DELETE /:contactId`

CRUD.

### 5.11 `GET /employees/:id/addresses` / `POST` / `PATCH /:addressId` / `DELETE /:addressId`

CRUD.

### 5.12 Bulk import

#### 5.12.1 `POST /employees/import/sessions`

Auth `employee.import`. Creates a new import session.

**Body**: `{ "file": <FileRef> }`.

**201**
```json
{ "data": { "session_id": "imp_...", "status": "validating" } }
```

#### 5.12.2 `GET /employees/import/sessions/:id`

**200**
```json
{
  "data": {
    "session_id": "imp_...",
    "status": "validated|error|imported",
    "rows_total": 120,
    "rows_valid": 118,
    "rows_invalid": 2,
    "errors": [{ "row": 7, "field": "work_email", "code": "validation.invalid_email", "message": "..." }],
    "preview": [{ "row": 1, "first_name": "...", "work_email": "..." }]
  }
}
```

#### 5.12.3 `POST /employees/import/sessions/:id/commit`

Commits valid rows. **202** then poll status. **Errors:** `domain.import_already_committed`.

### 5.13 `GET /employees/export`

Auth `employee.export`. Query supports same filters. Returns a signed CSV URL.

**200**: `{ "data": { "download_url": "https://...", "expires_at": "..." } }`.

---

## 6. Org Structure

### 6.1 Departments — `GET/POST /departments`, `GET/PATCH/DELETE /departments/:id`

Auth `org.structure.read` / `org.structure.write`. Fields per `02 § 2.3.1`. Cannot delete if employees attached (return `conflict.in_use`); offer "reassign" param.

### 6.2 Designations — `GET/POST /designations`, `GET/PATCH/DELETE /designations/:id`

Same shape.

### 6.3 Locations — `GET/POST /locations`, `GET/PATCH/DELETE /locations/:id`

Same shape.

---

## 7. Attendance

### 7.1 `GET /attendance/me/today`

Auth: self. Returns today's record for the authenticated employee.

**200**
```json
{
  "data": {
    "attendance_date": "2026-06-01",
    "check_in_at": "2026-06-01T03:32:00Z",
    "check_out_at": null,
    "worked_minutes": null,
    "status": "present",
    "is_late": false,
    "policy": { "day_start_time": "09:00", "day_end_time": "18:00", "grace_minutes_late": 15 }
  }
}
```

### 7.2 `POST /attendance/check-in`

Auth: self. **Idempotency-Key recommended**. Body optional: `{ "note": "..." }`. Server captures IP/UA from request.

**Errors:** `domain.already_checked_in`, `domain.on_leave`, `domain.weekend_off` (warn-only; allow with `force=true`).

### 7.3 `POST /attendance/check-out`

Auth: self. **Errors:** `domain.not_checked_in`.

### 7.4 `GET /attendance/me`

Auth: self. Query: `?from=&to=&page=&limit=`. Defaults to current month.

### 7.5 `GET /attendance`

Auth `attendance.read`. Admin endpoint. Filters: `?employee_id=&from=&to=&status=&department_id=&location_id=`.

### 7.6 `GET /attendance/today`

Admin view of today: counts + per-employee status.

**200**
```json
{
  "data": {
    "counts": { "present": 71, "absent": 4, "on_leave": 5, "holiday": 0 },
    "records": [{ "employee_id": "...", "display_name": "...", "status": "present", "check_in_at": "...", "check_out_at": null, "worked_minutes": null }]
  }
}
```

### 7.7 `GET /attendance/summary`

Query: `?from=&to=&group_by=employee|department|location`. Returns aggregated stats.

### 7.8 `GET /attendance/export`

Auth `attendance.export`. Returns signed CSV URL.

### 7.9 Regularization requests

#### 7.9.1 `POST /attendance/regularizations`

Auth: self. Body:
```json
{
  "attendance_date": "2026-05-29",
  "requested_check_in_at": "2026-05-29T03:30:00Z",
  "requested_check_out_at": "2026-05-29T12:30:00Z",
  "reason": "Forgot to check in due to client visit"
}
```

**Errors:** `domain.regularization_window_exceeded`, `domain.regularization_duplicate`.

#### 7.9.2 `GET /attendance/regularizations`

Auth `attendance.approve` (admin: all) or self (own). Query: `?status=&employee_id=&from=&to=`.

#### 7.9.3 `GET /attendance/regularizations/:id`

#### 7.9.4 `POST /attendance/regularizations/:id/approve`

Auth `attendance.approve`. Body: `{ "comment": "..." }`. Updates attendance record. **200**.

#### 7.9.5 `POST /attendance/regularizations/:id/reject`

Auth `attendance.approve`. Body: `{ "comment": "..." }`. **200**.

#### 7.9.6 `POST /attendance/regularizations/:id/cancel`

Self (only `pending`). **200**.

---

## 8. Leave

### 8.1 Leave types

#### 8.1.1 `GET /leave-types`

Auth `leave.policy.read`. Query: `?is_active=`.

#### 8.1.2 `POST /leave-types`

Auth `leave.policy.write`. Body: per `02 § 2.5.1`.

#### 8.1.3 `GET/PATCH/DELETE /leave-types/:id`

Standard. Delete only if no associated requests/balances; otherwise `conflict.in_use` and offer `is_active=false`.

### 8.2 Balances

#### 8.2.1 `GET /me/leave-balances`

Auth: self.

**200**
```json
{
  "data": [
    {
      "leave_type": { "id": "...", "code": "EL", "name": "Earned Leave", "color": "#3B82F6" },
      "period_year": 2026,
      "opening": "5.00",
      "accrued": "8.75",
      "used": "3.00",
      "reserved": "1.00",
      "adjusted": "0.00",
      "available": "9.75"
    }
  ]
}
```

#### 8.2.2 `GET /employees/:id/leave-balances`

Auth `leave.read`. Same shape.

#### 8.2.3 `GET /employees/:id/leave-ledger`

Paginated ledger entries. Auth `leave.read`.

#### 8.2.4 `POST /employees/:id/leave-balances/:typeId/adjust`

Auth `leave.balance.adjust`. Body: `{ "units": "2.5", "note": "Comp-off granted" }`. Writes `leave_ledger` entry `entry_type=adjust`; recomputes balance. **200**.

### 8.3 Leave requests

#### 8.3.1 `POST /leave-requests`

Auth: self (`leave.create`). Body:
```json
{
  "leave_type_id": "...",
  "start_date": "2026-07-10",
  "end_date": "2026-07-12",
  "is_half_day_start": false,
  "is_half_day_end": false,
  "reason": "Family event",
  "contact_during_leave": "+91-9xxxx",
  "attachment": { "url": "<s3 key>", "name": "doc.pdf", "mime_type": "application/pdf", "size_bytes": 12345 }
}
```

**Errors:** `domain.leave_insufficient_balance`, `domain.leave_overlap`, `domain.leave_notice_required`, `domain.leave_attachment_required`, `domain.leave_blackout`.

#### 8.3.2 `GET /leave-requests`

Auth `leave.read` (admin) or self. Query: `?status=&employee_id=&leave_type_id=&from=&to=&department_id=`.

#### 8.3.3 `GET /leave-requests/:id`

Returns request + approval history.

#### 8.3.4 `PATCH /leave-requests/:id`

Self, only while `pending`. Body: subset of editable fields. Re-validates policy.

#### 8.3.5 `POST /leave-requests/:id/cancel`

Self, only while `pending`. Releases reservation.

#### 8.3.6 `POST /leave-requests/:id/withdraw`

Self, on `approved` requests that haven't started. Releases ledger and reverts to `withdrawn`.

#### 8.3.7 `POST /leave-requests/:id/approve`

Auth `leave.approve`. Body: `{ "comment": "..." }`.

#### 8.3.8 `POST /leave-requests/:id/reject`

Auth `leave.reject`. Body: `{ "comment": "..." }`.

#### 8.3.9 `GET /leave-requests/:id/approval-history`

Returns `leave_approval_history` rows.

### 8.4 Calendar

#### 8.4.1 `GET /leave-calendar`

Query: `?from=&to=&department_id=&location_id=&employee_id=`. Returns approved leaves as calendar events.

**200**
```json
{ "data": [{ "employee_id": "...", "display_name": "...", "leave_type": { "code": "EL", "color": "#3B82F6" }, "start_date": "...", "end_date": "...", "is_half_day_start": false, "is_half_day_end": false }] }
```

### 8.5 Export

`GET /leave-requests/export` — signed CSV URL (filters same as list).

---

## 9. Documents

### 9.1 Categories

`GET /documents/categories`, `POST`, `PATCH /:id`, `DELETE /:id`. Auth `document.category.read/write`. Cannot delete `is_system` or if documents attached.

### 9.2 Documents

#### 9.2.1 `GET /documents`

Auth `document.read`. Query: `?q=&category_id=&is_required=&is_personal=&subject_employee_id=&status=draft|published`.

#### 9.2.2 `POST /documents`

Auth `document.create`. Body:
```json
{
  "title": "Code of Conduct 2026",
  "description": "...",
  "category_id": "...",
  "file": { "url": "<s3 key>", "name": "code.pdf", "mime_type": "application/pdf", "size_bytes": 234567 },
  "is_required": true,
  "due_by": "2026-07-15",
  "is_personal": false,
  "subject_employee_id": null,
  "audience": { "kind": "all_employees", "values": [] },
  "publish_now": true,
  "expires_at": null
}
```

#### 9.2.3 `GET /documents/:id`

Returns doc + `audience` summary + acknowledgment counts.

#### 9.2.4 `PATCH /documents/:id`

Only drafts editable in full; published can edit title/description/expiry only.

#### 9.2.5 `POST /documents/:id/publish`

Moves draft → published.

#### 9.2.6 `POST /documents/:id/archive`

Soft-delete after publish window; visible in admin reports.

#### 9.2.7 `GET /documents/:id/acknowledgments`

Auth `document.read`. Paginated list of employees with `acknowledged_at` (null = pending).

#### 9.2.8 `POST /documents/:id/acknowledge`

Auth: self for assigned, `document.acknowledge` for admin proxy-ack (rarely used).

#### 9.2.9 `POST /documents/:id/remind`

Auth `document.update`. Sends reminders to non-ackers. **202**.

### 9.3 Employee personal documents

#### 9.3.1 `GET /me/documents`

Returns docs targeted at the authenticated employee (assigned via audience + personal docs where subject = self).

#### 9.3.2 `POST /me/documents`

Auth: self. Upload a required personal doc (e.g., PAN). Body:
```json
{ "category_id": "...", "title": "PAN", "file": <FileRef> }
```

#### 9.3.3 `GET /employees/:id/documents`

Auth `employee.documents.read`. List of docs visible/issued to that employee.

---

## 10. Announcements

### 10.1 `GET /announcements`

Auth `announcement.read`. Query: `?status=&q=&priority=&pinned=`.

### 10.2 `POST /announcements`

Auth `announcement.create`. Body:
```json
{
  "title": "Office closed July 4",
  "body_html": "<p>...</p>",
  "cover_image_url": null,
  "pinned": false,
  "priority": "high",
  "requires_acknowledgment": true,
  "audience": { "kind": "location", "values": ["<location-id>"] },
  "scheduled_for": "2026-07-01T03:30:00Z",
  "expires_at": "2026-07-10T03:30:00Z"
}
```
Returns `status=scheduled` or `draft` depending on flags.

### 10.3 `GET /announcements/:id`

Returns announcement + audience + acknowledgment counts. Authorized for audience members and any admin with `announcement.read`.

### 10.4 `PATCH /announcements/:id`

Only `draft`/`scheduled` are fully editable; `published` allows title/expiry only.

### 10.5 `POST /announcements/:id/publish`

Auth `announcement.publish`. Moves to `published` immediately.

### 10.6 `POST /announcements/:id/archive`

`announcement.delete`. Soft-archive.

### 10.7 `POST /announcements/:id/acknowledge`

Self.

### 10.8 `GET /announcements/:id/acknowledgments`

Paginated list of audience employees with ack status.

### 10.9 `POST /announcements/audience/preview`

Body: an `Audience`. Returns the resolved employee list (id + display_name, limited to 200 + count).

### 10.10 `GET /me/announcements`

Feed for the authenticated user — only published announcements whose audience includes them.

---

## 11. Holidays

### 11.1 `GET /holiday-calendars`

Auth `holiday.read`.

### 11.2 `POST /holiday-calendars`

Auth `holiday.write`. Body: `{ "name": "India 2026", "country": "IN", "region": null, "description": "..." }`.

### 11.3 `GET/PATCH/DELETE /holiday-calendars/:id`

Standard. Cannot delete default.

### 11.4 `POST /holiday-calendars/:id/set-default`

### 11.5 `GET /holiday-calendars/:id/holidays`

Query: `?year=`. List.

### 11.6 `POST /holiday-calendars/:id/holidays`

Body: `{ "name": "Republic Day", "observed_on": "2026-01-26", "kind": "public", "is_optional": false, "description": "..." }`.

### 11.7 `PATCH/DELETE /holiday-calendars/:id/holidays/:holidayId`

### 11.8 `POST /holiday-calendars/:id/import`

Body: `{ "file": <FileRef> }` (CSV). Returns summary `{ imported, skipped, errors }`.

### 11.9 `GET /holiday-calendars/:id/assignments` / `PUT /holiday-calendars/:id/assignments`

Replaces the assignment set: `{ "assignments": [{ "scope_kind": "location", "scope_value": "<id>" }, ...] }`.

### 11.10 `GET /me/holidays`

Returns the holidays applicable to the authenticated employee (resolution: employee → location → org default).

---

## 12. Dashboard

### 12.1 `GET /dashboard/admin`

Auth `dashboard.view`. Returns a bundle of widget payloads keyed by widget name (`01 § 12`).

**200**
```json
{
  "data": {
    "headcount": { "total": 137, "delta_month": 4 },
    "present_today": { "present": 121, "absent": 8, "on_leave": 8 },
    "pending_approvals": { "leave": 6, "regularization": 3 },
    "upcoming_holidays": [{ "name": "Independence Day", "observed_on": "2026-08-15", "calendar_name": "India 2026" }],
    "birthdays_anniversaries": { "birthdays": [...], "work_anniversaries": [...] },
    "new_hires": [{ "id": "...", "display_name": "...", "joined_on": "..." }],
    "attrition": { "last_30_days": 2, "employees": [...] },
    "recent_announcements": [{ "id": "...", "title": "...", "published_at": "...", "ack_required": true, "ack_count": 92, "ack_total": 137 }],
    "ack_compliance": { "docs_pct": 92.5, "announcements_pct": 88.0 },
    "getting_started_checklist": [{ "id": "invite_first_employee", "label": "Invite your first teammate", "done": true }]
  }
}
```

### 12.2 `GET /dashboard/employee`

Auth: self.

**200**
```json
{
  "data": {
    "today_status": { "checked_in_at": null, "checked_out_at": null, "expected_start": "09:00", "expected_end": "18:00", "is_holiday": false, "is_weekoff": false, "is_on_leave": false },
    "my_leave_balance": [{ "leave_type": { "code": "EL", "name": "Earned Leave" }, "available": "9.75" }],
    "my_next_leave": { "id": "...", "leave_type_code": "EL", "start_date": "...", "end_date": "..." },
    "pending_tasks": { "doc_acks": 2, "announcement_acks": 1, "regularizations_pending": 0 },
    "announcements": [{ "id": "...", "title": "...", "published_at": "..." }],
    "upcoming_holidays": [{ "name": "...", "observed_on": "..." }],
    "team_birthdays": [{ "display_name": "...", "date_of_birth_md": "06-04" }]
  }
}
```

---

## 13. Notifications

### 13.1 `GET /me/notifications`

Cursor pagination. Query: `?unread_only=true&cursor=&limit=20`.

**200**
```json
{
  "data": [{ "id": "...", "template_id": "tpl.leave.approved", "payload": { "...": "..." }, "link_to": "/leave/abc", "priority": "normal", "read_at": null, "created_at": "..." }],
  "meta": { "next_cursor": "...", "limit": 20, "has_next_page": true }
}
```

### 13.2 `POST /me/notifications/:id/read`

**204**.

### 13.3 `POST /me/notifications/read-all`

**204**.

### 13.4 `GET /me/notification-preferences` / `PUT /me/notification-preferences`

Body for PUT: `[{ "template_id": "tpl.ann.published", "email_enabled": false, "inapp_enabled": true }]`.

---

## 14. Files

### 14.1 `POST /files/presign-upload`

Auth: any authenticated. Body: `{ "intent": "logo|document|attachment|profile_photo", "name": "file.pdf", "mime_type": "application/pdf", "size_bytes": 123456 }`.

Server validates mime/size against intent allowlist; returns:

**200**
```json
{
  "data": {
    "upload_url": "https://s3....",
    "method": "PUT",
    "headers": { "Content-Type": "application/pdf" },
    "key": "uploads/<org>/<uuid>",
    "expires_at": "...",
    "max_size_bytes": 26214400
  }
}
```

### 14.2 `POST /files/confirm-upload`

Verifies the object exists in S3 and returns canonical `FileRef`.

### 14.3 `GET /files/:key/download`

Returns a short-TTL signed URL. Authorization checks ownership: org match + (subject_employee = self) OR (admin permission for the resource type the file belongs to).

---

## 15. Audit Log

### 15.1 `GET /audit-logs`

Auth `audit.read`. Cursor pagination. Filters: `?actor_user_id=&action=&resource_type=&resource_id=&from=&to=`.

**200**
```json
{
  "data": [{ "id": "...", "actor_user_id": "...", "actor_display_name": "Priya Sharma", "action": "leave.approve", "resource_type": "leave_request", "resource_id": "...", "before": { "status": "pending" }, "after": { "status": "approved" }, "metadata": { "ip": "...", "ua": "..." }, "created_at": "..." }],
  "meta": { "next_cursor": "...", "limit": 50 }
}
```

---

## 16. Search

### 16.1 `GET /search`

Auth: any authenticated. Query: `?q=marie&types=employee,document,announcement&limit=10`.

Server filters results by what the principal can see (RBAC + audience for documents/announcements).

**200**
```json
{
  "data": {
    "employees": [{ "id": "...", "display_name": "Maria Garcia", "department": "Engineering" }],
    "documents": [{ "id": "...", "title": "..." }],
    "announcements": [{ "id": "...", "title": "..." }]
  }
}
```

---

## 17. Health & meta

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness — 200 if process up. |
| GET | `/readyz` | Readiness — checks DB + Redis. |
| GET | `/version` | Build SHA, version. |
| GET | `/metrics` | Prometheus scrape endpoint. Internal only (network ACL). |

---

## 18. Endpoint → Permission → Notification cross-reference

| Endpoint | Method | Permission(s) | Triggers notification(s) |
|---|---|---|---|
| `/auth/sign-up` | POST | — | — |
| `/auth/sign-in` | POST | — | — |
| `/employees` | POST | `employee.create`, `employee.invite` | `tpl.invite` |
| `/employees/:id` | PATCH | `employee.update` or self | — |
| `/employees/:id/deactivate` | POST | `employee.delete` | — (audit only) |
| `/auth/invite/accept` | POST | — | `tpl.invite.accepted` (to inviter) |
| `/auth/forgot-password` | POST | — | `tpl.reset` |
| `/auth/change-password` | POST | self | `tpl.password.changed` |
| `/attendance/check-in` / `check-out` | POST | `attendance.write` (self) | — |
| `/attendance/regularizations` | POST | self | `tpl.reg.submitted` |
| `/attendance/regularizations/:id/approve`/`reject` | POST | `attendance.approve` | `tpl.reg.decided` |
| `/leave-requests` | POST | `leave.create` | `tpl.leave.submitted` |
| `/leave-requests/:id/approve` | POST | `leave.approve` | `tpl.leave.approved` |
| `/leave-requests/:id/reject` | POST | `leave.reject` | `tpl.leave.rejected` |
| `/leave-requests/:id/cancel` | POST | self | `tpl.leave.cancelled` |
| `/documents` | POST | `document.create` | `tpl.doc.assigned` (when published) |
| `/documents/:id/remind` | POST | `document.update` | `tpl.doc.remind` |
| `/announcements` | POST | `announcement.create` | `tpl.ann.published` (when published) |
| `/holiday-calendars/:id` | PATCH | `holiday.write` | `tpl.holiday.updated` |

(Daily/weekly digests like `tpl.birthday` are produced by scheduled jobs, not endpoints.)

---

## 19. Implementation notes for the API agent

- Use NestJS modules per § 2 above (one module per top-level heading: `AuthModule`, `OrganizationModule`, `RbacModule`, `EmployeesModule`, `OrgStructureModule`, `AttendanceModule`, `LeaveModule`, `DocumentsModule`, `AnnouncementsModule`, `HolidaysModule`, `DashboardModule`, `NotificationsModule`, `FilesModule`, `AuditModule`, `SearchModule`, `HealthModule`).
- A single Zod schema per request/response shape lives in `packages/types/api/<module>.ts` and is consumed by both the API (validation pipe) and the clients (TanStack Query types).
- All write endpoints emit a single `audit_logs` entry through a global `AuditInterceptor`; never log secrets, never log raw passwords.
- All state-changing endpoints accept and respect `Idempotency-Key`.
- All endpoints set `X-Request-Id` (echo client header if present, else generate ULID).
- Errors use a domain `DomainException` class mapped to the envelope in § 1.4 by a global filter.
