# Phase 8 — Notification Certification

Captured: 2026-06-10 (~13:45Z) · Program phase 8 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: notification read-state flows + fan-out driven live via the API; demo announcement count brought to the program's expected 7+ (F-0.3).

## Verdict: PASS (delivery/read-state/counters/fan-out correct; F-0.3 demo-count fixed)

| Capability | Result | Evidence |
| --- | --- | --- |
| List (`/me/notifications`) | **PASS** — self-scoped feed (`templateId`, `payload`, `linkTo`, `priority`, `readAt`) | §1 |
| Unread count | **PASS** — `/me/notifications/unread-count` → `{count}` | §1 |
| Mark one read | **PASS** — `POST /:id/read` → 204; count 5 → 4 | §1 |
| Mark all read | **PASS** — `POST /read-all` → 204; count → 0 | §1 |
| Fan-out on event | **PASS** — publishing an announcement to `all_employees` created an `announcement.published` notification for the employee (unread 0 → 1) linking to the announcement | §2 |
| Self-scoping | **PASS** — each user sees only their own (service filters by `userId` + tenant); no `notification.*` permission, authenticated-only | §1 |
| Badge/counter consistency | **PASS** — unread-count tracks read transitions exactly | §1 |

## 1. Read-state & counters (live, employee)

```
GET /me/notifications            → 6 notifications (templateId e.g. document.assigned, linkTo /documents)
GET /me/notifications/unread-count → {count:5}
POST /me/notifications/<id>/read → 204;  unread-count → {count:4}
POST /me/notifications/read-all  → 204;  unread-count → {count:0}
```

Notifications carry a `templateId` (the event type, e.g. `document.assigned`, `announcement.published`, `leave.*`) and a `payload`/`linkTo` for deep-linking. Read state is per-user; counters recompute from `readAt IS NULL`.

## 2. Fan-out (live)

```
POST /announcements {title, bodyHtml, audiences:[{type:all_employees}]}  → 201
POST /announcements/<id>/publish                                          → 201
→ employee /me/notifications/unread-count: 0 → 1
→ new notification templateId=announcement.published linkTo=/announcements/<id>
```

Confirms the publish path fans out notifications to the resolved audience (also covered by `announcements.integration.spec.ts`: publish flips status + notifies; scheduled publish notifies on cron tick; re-publish is a no-op). Notification sources across the app: document-assigned/ack, leave decision, announcement publish, attendance regularization decisions.

## 3. Findings

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| F-0.3 | P3 (demo quality) | Demo had **6** announcements; program expected 7+ | **FIXED** — added 2 published announcements (new-hires welcome, security-training ack) → **8 total**; `db:verify:demo` still 6/6 |
| F-8.1 | info | Notifications are persisted rows polled by the client (no websocket/push); unread badge is request-time. Fine for the demo; real-time delivery would need SSE/WS | Note (not a defect) |

## 4. Gates & cleanup

Demo re-seeded (announcements 6 → 8; documents/notifications unchanged at 20/24). Test announcement + its fan-out notifications removed; employee notification read-state restored. Gates: typecheck 7/7 · lint 0 errors · format clean · unit 101/101 · integration 248/248 · build 7/7.
