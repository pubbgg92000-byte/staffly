# Phase 6 — Leave Management Certification

Captured: 2026-06-10 (~13:35Z) · Program phase 6 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: full leave lifecycle driven live via the API (employee apply, HR approve/reject, self cancel, manager team-scoped reject), with balance arithmetic checked at each transition and emails verified in Mailhog. Test requests removed afterwards.

## Verdict: PASS (all flows correct; no code changes needed)

| Flow | Result | Evidence |
| --- | --- | --- |
| Apply (self) | **PASS** — `pending`, units computed, balance reserved | §1 |
| Balance reservation on apply | **PASS** — CL available 12 → 10, pending 0 → 2 | §1 |
| Approve (HR, org-wide) | **PASS** — 200; pending 2 → 0, used 0 → 2 | §1 |
| Reject (HR) | **PASS** — 200; reserved units released | §1 |
| Cancel (self) | **PASS** — 200; used 2 → 0, fully released (available back to 12) | §1 |
| Overlap rejection | **PASS** — overlapping pending/approved range → 400 | §1 |
| Manager approve/reject (team-scoped) | **PASS** — out-of-team reject → 403 (in-team certified Phase 3) | §1 |
| Leave-approved email | **PASS** — Mailhog "Your leave request was approved" → applicant | §2 |
| Leave-rejected email | **PASS** — Mailhog "Your leave request was rejected" → applicant | §2 |
| Balance read scope | **PASS** — employee reads only own (`/balances/me`); manager team-scoped (Phase 3 fix); `/leave/types` admin-only | §1 |
| Dashboard `onLeaveToday` / `leaveTrend` | **PASS** — matches approved leave spanning today (Phase 5 §2; Phase 10 full recompute) | — |

## 1. Lifecycle trace (CL = Casual Leave, allocated 12)

```
apply 2026-08-17..18 (employee)   → pending, units=2;   CL available 10, pending 2
approve (HR)                      → 200;                 CL used 2, pending 0, available 10
                                  (email: "Your leave request was approved" → employee)
apply 2026-08-18..19 (overlaps)   → 400                  (overlap with non-terminal request)
apply 2026-09-14..15 → reject(HR) → 200;                 reserved units released
                                  (email: "Your leave request was rejected" → employee)
cancel the approved 08-17 req     → 200;                 CL used 0, pending 0, available 12  (fully released)
manager reject OUTSIDE-team req   → 403                  (team scope; in-team approve/reject certified Phase 3)
```

Balance algebra verified at every step (`available = allocated + carryForward + adjusted − used − pending`): apply reserves into `pending`; approve moves `pending → used`; reject/cancel release. Half-day and LOP (accrual 0, balance-check bypass) paths are covered by the integration suite (`leave.integration.spec.ts`, 20 tests).

## 2. Emails (Mailhog, EMAIL_PROVIDER=smtp)

Both decision emails fire-and-forget on the approve/reject transition and were received with the applicant as recipient:
- approve → **"Your leave request was approved"**
- reject → **"Your leave request was rejected"**

(Apply does not email; the manager/HR sees pending requests in their queue. Leave decision emails round out the 5 wired flows alongside Phase 2's invite/welcome/reset.)

## 3. Findings

None requiring a fix. Observations:

| ID | Sev | Note | Disposition |
| --- | --- | --- | --- |
| F-6.1 | info | `leave.create`/`leave.cancel` self routes have no `@RequirePermission` guard (service binds to caller) — same class as F-3.6 | Phase 11 (defense-in-depth) |
| F-6.2 | info | Decision emails are fire-and-forget (never block the API response) and silently no-op if the mailer is misconfigured — by design; OI-02 tracks live-provider verification | — |

## 4. Cleanup

The lifecycle created 2 test requests (`Cert test leave`, `to be rejected`) and touched the employee's CL balance; both requests + their approval rows + the resulting notifications were removed, and the CL balance verified back to baseline (allocated 12 / used 0 / pending 0). Demo leave-request count back to 59. No seed code changed this phase.
