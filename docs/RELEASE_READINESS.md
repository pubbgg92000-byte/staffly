# Staffly v1.0 — Release Readiness

Companion to `docs/CERTIFICATION_REPORT.md`. Captured: 2026-06-11 ·
Branch `feat/v0.23.2-prod-readiness` · Basis: 18 certified phases + defect
reconciliation (`docs/certification/DEFECT_RECONCILIATION.md`).

## 1. Reconciled readiness score: **94 / 100**

### 1.1 Why two prior numbers existed

- **93/100** — the documented pre-certification score
  (`PROD_SIGNOFF.md:40`, `DEPLOYMENT_READINESS.md:125`; trajectory 84→90→93).
  It was a self-assessment of *intent*: features built, gates green, docs
  written — but most claims had not been adversarially verified live.
- **72/100** — an uncommitted conversational audit taken pre-sprint. It priced
  in the then-unverified risk (seed contradictions, CSRF no-op, BAC gaps,
  fake document binaries) that the 93 did not. It exists in no committed
  artifact (`CERTIFICATION_BASELINE.md` §9).

Both were point-in-time estimates with different risk models. This program
replaced estimation with evidence: every claim behind the 93 was re-tested
live, every risk behind the 72 was either fixed at a gate or explicitly
dispositioned. The reconciliation below uses the program's own rubric, so the
final number supersedes both.

### 1.2 Rubric (weights sum to 100)

| Dimension | Weight | Earned | Evidence |
| --- | --- | --- | --- |
| Functional correctness (auth, RBAC, employee, attendance, leave, documents, notifications, dashboard) | 30 | 30 | Phases 2–10 all PASS, DB==API parity, 0 open functional defects |
| Security | 15 | 14 | Phase 13: 0×P0/P1/P2 open; −1 for 2×P3 residuals (client mimeType, self-service guards) |
| Performance & scale | 10 | 10 | Phase 12 PASS @5,000 emp, p95 ≤ 51 ms, scale-flat SQL (P3 fan-out is optional optimization) |
| Test & gate health | 10 | 10 | unit 124/124, integration 248/248, build 7/7, lint/format clean |
| Deployability (config guards, backup/restore, rollback, checklist) | 15 | 11 | Phase 14 PASS locally; −4 for the 4 deploy-time OPEN items (OI-01..04) not closable pre-deploy |
| Data & demo quality (seed realism, multi-region, demo script) | 10 | 10 | Phases 5/17/18: verify-demo 6/6 both profiles, scripted demo |
| UX & accessibility | 5 | 4 | Phase 15 PASS with findings; −1 for 3×P2 (keyboard a11y, error boundaries, tab title) |
| Documentation & operability | 5 | 5 | Phase 16 audit: 9 docs refreshed, runbook/checklist current |
| **Total** | **100** | **94** | |

The 94 sits above the old 93 because everything the 93 *assumed* is now
*verified*, and the deductions that remain are precisely enumerated residuals
rather than unknown risk.

### 1.3 What the missing 6 points are

1. **−4 deploy-time verification** — cookies/CORS on real DNS (OI-01), live
   email provider send (OI-02), R2 + Tunnel provisioning (OI-03), restore
   drill on the production host (OI-04). Closable only at deploy; each is a
   runnable section of `docs/DEPLOY_CHECKLIST.md`.
2. **−1 security P3 residuals** — client-supplied `mimeType` trusted
   (defense-in-depth HEAD-verify tracked), self-service guard depth.
3. **−1 UX P2s** — keyboard a11y coverage, nested error boundaries, static
   tab titles (Phase 15 `UX_REVIEW.md`).

## 2. GO/NO-GO matrix per target

| Target | Verdict | Conditions |
| --- | --- | --- |
| **Local demo / investor walkthrough** | **GO** | None. `pnpm dev` + reseed (`DEMO_PROFILE=india` for the scripted flavor); follow `docs/DEMO_SCRIPT.md`. |
| **Staging (real DNS, real providers, non-customer data)** | **GO** | Run `DEPLOY_CHECKLIST.md` §1–§9 as the deployment itself; staging *is* the venue that closes OI-01/02/03. |
| **Production (paying tenants)** | **CONDITIONAL GO** | All four deploy-time items verified live first: §1 DNS/cookies/CORS (OI-01), §9 provider send smoke (OI-02), §2+§5 R2/Tunnel (OI-03), §10 restore drill on prod host (OI-04). Plus the one-row manager-permission backfill for any pre-existing tenant (OI-06, `RELEASE_NOTES.md`). Sign `PROD_SIGNOFF.md` checkboxes at completion (OI-15). |

No target is NO-GO. Production's conditions are mechanical checklist items,
not engineering work.

## 3. Residual-risk register (post-certification)

| Risk | Severity | Owner action |
| --- | --- | --- |
| OI-01..03 deploy-time infra verification | High until staging run, then closed | `DEPLOY_CHECKLIST.md` §1, §2, §5, §9 |
| OI-04 restore drill on prod host | Medium | `DEPLOY_CHECKLIST.md` §10 (local drill already 37/37 green) |
| ED-08 residual: client `mimeType` trusted | P3 | HEAD-verify upgrade tracked in `SECURITY_REPORT.md` §1 |
| OI-14 residual: 15-min access-token window post-deactivation | P3 (by design) | Documented `SECURITY_REPORT.md` §5 |
| PERF-01 dashboard ~50-stmt fan-out | P3 | Optional optimization; flat at 5k employees |
| UX-01..03 (a11y keyboard paths, error boundaries, tab titles) | P2 | Post-v1.0 UX sprint candidate |

## 4. Release mechanics

- Release branch: `feat/v0.23.2-prod-readiness` — **nothing pushed**; push,
  PR, merge, and deploy each require explicit approval (standing program
  rule, OI-15).
- Versioning: `CHANGELOG.md` `[Unreleased]` block is current through the
  certification commits; cut `v1.0.0` from it at release.
- Rollback: contract verified in Phase 14 (`PRODUCTION_SIGNOFF.md`);
  procedure in `RUNBOOK.md` + `DEPLOY_CHECKLIST.md` §11.

## 5. Sign-off

| Gate | Status |
| --- | --- |
| All 18 phases certified | ✅ (report table, `CERTIFICATION_REPORT.md` §2) |
| Defect reconciliation: 0 P0/P1 open | ✅ (`DEFECT_RECONCILIATION.md`) |
| Final gates green at HEAD | ✅ unit 124/124 · integration 248/248 · build 7/7 |
| Production deploy | ⬜ awaiting explicit approval + checklist run |
