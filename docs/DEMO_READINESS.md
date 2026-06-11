# Demo Readiness — RC-1 Inspection (2026-06-11)

Scope: can the **live local demo** (Acme Corporation / `staffly-demo`,
4 demo accounts) be run for an investor or customer audience today, with
no surprises? Evidence: RC-1 Phases 1–8, all probes real HTTP/DB.

## 1. Demo account status — all four VERIFIED LIVE

| Account | Login | Full auth cycle (refresh/CSRF/logout) | Role scope verified |
| --- | --- | --- | --- |
| superadmin@acme.demo | ✅ 200 | ✅ | org visibility + audit access (13 endpoints green) |
| hr@acme.demo | ✅ 200 | ✅ | org-wide employees/attendance/approvals/announcements |
| manager@acme.demo | ✅ 200 | ✅ | exactly subtree + self; approve & reject work |
| employee@acme.demo | ✅ 200 | ✅ | self-scope dashboard/attendance/leave/docs |

⚠️ **These logins were dead this morning** (RC-01 password drift after
reseed) and were remediated live. **Before any external demo: run the
login smoke (4 sign-ins) and do NOT reseed without `DEMO_*_PASSWORD`
exported** — see RC-01-residual in `docs/OPEN_BLOCKERS.md` §1.

## 2. Demo storyline coverage (all verified end-to-end)

| Beat | Status | Notes for presenter |
| --- | --- | --- |
| Employee check-in/out + today widget | ✅ | don't demo check-out before ~12:30 PM ET / 09:30 AM PT (RC-02: seeded check-in is "today 9 AM local"; an earlier check-out shows a 0-min half-day) |
| Employee dashboard (balances, history, docs, holidays) | ✅ | all widgets recompute exactly vs DB (Phase 4); weekends show as "absent" in the 7-day strip (OBS-2) — pre-empt or avoid hovering |
| Apply leave → manager approve/reject | ✅ | decision lands as **email** (show Mailhog/mail client), not the in-app bell (RC-03) |
| Manager team view | ✅ | 9 reports + self, scoping exact |
| HR: create/edit employee, audit trail | ✅ | "create employee" does NOT auto-send the portal invite — use the explicit Invite action for the onboarding beat (by design) |
| HR/admin dashboard | ✅ | mid-day buckets don't sum to 40 (OBS-1) — say "5 haven't checked in yet" |
| Documents: upload/download/acknowledge | ✅ | byte-verified PDFs; storage 22/22 intact |
| Announcements | ✅ | 6 published / 1 scheduled / 1 draft, XSS-sanitized |
| Emails (reset, leave decisions) | ✅ | live SMTP → Mailhog :8025 |
| Audit log (superadmin) | ✅ | probe actions appeared in real time |
| Multi-region flavor (India profile) | ✅ available | `DEMO_PROFILE=india` reseed of the same org (v1.0 Phase 18) — **export the demo passwords when reseeding** |

## 3. Pre-demo checklist (5 minutes)

1. `docker ps` — postgres/redis/minio/mailhog healthy; `pnpm dev` up
   (:3000/:3001/:4000), `/readyz` green.
2. Four sign-ins (or the Phase 2 cycle script) — all 200.
3. `pnpm --filter @staffly/api db:verify:demo` — expect 6/6.
4. Time-of-day check for the check-out beat (RC-02 above).
5. Mailhog open in a background tab for the leave-decision beat.

## 4. Verdicts

| Audience | Verdict | Rationale |
| --- | --- | --- |
| **Investor Demo** | **GO** | every storyline beat verified live today; cosmetic items have narration workarounds; run the 5-min checklist first |
| **Customer Demo** | **GO** | same evidence; RC-03/OBS-2 worth fixing before repeated customer use but not blocking |

Production-facing verdicts live in `docs/FINAL_RC_REPORT.md`.
