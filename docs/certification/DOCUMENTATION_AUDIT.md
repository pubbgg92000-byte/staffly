# Phase 16 — Documentation Audit

Captured: 2026-06-11 · Branch `feat/v0.23.2-prod-readiness` @ `d912745` · Demo tenant `staffly-demo`
Method: read every tracked Markdown doc at the repo root and under `docs/`; cross-check each
claim against the current branch state (commits, gates, code) and against the per-phase
certification reports landed in this sprint; classify PASS / STALE / UPDATED with the change
captured here, then apply targeted edits inline (no rewrites — this phase preserves prior
evidence and patches only what diverges from current truth).

## Verdict: PASS — every user-facing reference doc now reflects the certified branch state. 9 docs updated in place; 4 cross-cert reports kept as-is (snapshots); 1 sprint snapshot (`PROJECT_STATE.md`) carries a supersession banner instead of a rewrite.

## 1. Doc inventory and disposition

| Doc | Path | Status | Disposition |
| --- | --- | --- | --- |
| README | `README.md` | UPDATED | Status line: `v0.23.2-deploy` → `v0.23.2 production-readiness` + pointer to `docs/certification/` and `PRODUCTION_SIGNOFF.md` |
| Changelog | `CHANGELOG.md` | UPDATED | `[Unreleased]` extended with the certification security / production-safety / data-quality fix blocks landed on this branch; stale "leave.reject backfill" line removed |
| Running locally | `RUNNING.md` | PASS | Accurate against `pnpm dev` + infra compose; dev seed users still correct |
| Demo guide | `docs/DEMO_GUIDE.md` | PASS | Login table, demo flow, reseed command all match the seeded org |
| Testing guide | `docs/TESTING.md` | UPDATED | Unit count 49 → **101**; integration 241 → **248**; "Email rendering/delivery (not wired)" replaced with the actual state (wired; live-verified on Mailhog; provider sends are a deploy-time smoke); added pointer to certification reports |
| Runbook | `docs/RUNBOOK.md` | UPDATED | Mailhog row: "(email send not wired)" → describes `EMAIL_PROVIDER=smtp` and the wired flows |
| Deployment design | `docs/DEPLOYMENT.md` | PASS | Topology, env table (incl. `EMAIL_PROVIDER` boot-fatal note), Vercel/PM2/Caddy/Tunnel/R2 steps match what the certification verified |
| Deploy checklist | `docs/DEPLOY_CHECKLIST.md` | PASS | Pre-flight items still load-bearing; nothing the cert phases invalidated |
| Release notes (sprint) | `docs/RELEASE_NOTES.md` | UPDATED | Commit table extended with the eight certification-phase commits (`4b0d989`, `1d29173`, `0bbc97d`, `3297aec`, `e9a557c`, `8707dc8`, `2883817`, `3602723`); gates 56/242 → **101/248**; verification summary refreshed with security 0×P0/P1/P2 + performance PASS @5000 emp |
| Old sprint sign-off | `docs/PROD_SIGNOFF.md` | UPDATED | Supersession banner at the top pointing to `PRODUCTION_SIGNOFF.md` (Phase 14); body preserved as the 2026-06-10 snapshot |
| Old readiness report | `docs/DEPLOYMENT_READINESS.md` | UPDATED | Supersession banner at the top (branch `feat/v0.23.2-deploy`, predates certification fixes) |
| Project state | `docs/PROJECT_STATE.md` | UPDATED | Top banner: v0.23 sprint snapshot, superseded by certification reports; §7 Known issues block is point-in-time. Body preserved as historical record |
| Test evidence | `docs/TEST_EVIDENCE.md` | PASS | Sprint-time evidence file (gate output, Mailhog receipts, backup/restore drill, domain-validation transcripts) — kept as historical evidence; certification supersedes via per-phase reports |
| Security report (final) | `docs/SECURITY_REPORT.md` | UPDATED | Added §5 "Post-gate remediation (commit `2883817`)" — maps each Phase-13 finding to the fix that closed it; updated verdict to 0×P0/P1/P2 open |
| Performance report (final) | `docs/PERFORMANCE_REPORT.md` | PASS | Captured 2026-06-11 at `2883817`; current |
| Production sign-off (final) | `docs/PRODUCTION_SIGNOFF.md` | PASS | Captured 2026-06-11 at `2e4dacf` (Phase 14); current go/no-go |
| Cert: Auth | `docs/certification/AUTH_CERTIFICATION.md` | PASS (snapshot) | Point-in-time evidence; CSRF-on-refresh fix re-confirmed in Phase 13 §2 |
| Cert: RBAC | `docs/certification/RBAC_MATRIX.md` | PASS (snapshot) | Point-in-time matrix; manager BAC fix re-confirmed in Phase 13 §2 |
| Cert: Employee lifecycle | `docs/certification/EMPLOYEE_TRACE.md` | PASS (snapshot) | — |
| Cert: Attendance | `docs/certification/ATTENDANCE_CERTIFICATION.md` | PASS (snapshot) | Timezone-realistic seed fix landed at this phase |
| Cert: Leave | `docs/certification/LEAVE_CERTIFICATION.md` | PASS (snapshot) | — |
| Cert: Documents | `docs/certification/DOCUMENT_CERTIFICATION.md` | PASS (snapshot) | PDF-binaries fix (`8707dc8`) landed at this phase; cross-tenant storage-key guard added in Phase 13 |
| Cert: Notifications | `docs/certification/NOTIFICATION_CERTIFICATION.md` | PASS (snapshot) | — |
| Cert: Email | `docs/certification/EMAIL_CERTIFICATION.md` | PASS (snapshot) | — |
| Cert: Dashboards | `docs/certification/DASHBOARD_CERTIFICATION.md` | PASS (snapshot) | — |
| Cert: Infra | `docs/certification/INFRA_CERTIFICATION.md` | PASS (snapshot) | `/readyz` semantics fix and SMTP_SECURE parse landed at this phase |
| Cert: Performance | `docs/certification/PERFORMANCE_REPORT.md` | PASS (snapshot) | Mirrors `docs/PERFORMANCE_REPORT.md` |
| Cert: UX | `docs/certification/UX_REVIEW.md` | PASS (snapshot) | Captured 2026-06-11 at `3602723` |
| Cert: Documentation (this file) | `docs/certification/DOCUMENTATION_AUDIT.md` | NEW | — |
| Baseline | `docs/CERTIFICATION_BASELINE.md` | PASS (pinned) | OI-/ED- inventory — load-bearing for the final report's defect reconciliation |
| Planning docs (00–08) | `docs/00-product-overview.md` … `docs/08-technical-architecture.md` | PASS | Pre-product planning — not in cert scope; status unchanged |
| Releases | `docs/releases/v0.23.2.md` | PASS | — |

## 2. Edits applied (verbatim diff summary)

1. **`README.md`** — status block points to certification + PRODUCTION_SIGNOFF.
2. **`CHANGELOG.md`** — `[Unreleased]` now lists certification-phase security fixes (XSS sanitizer; CSRF-on-refresh; regularization scope; storage-key tenant guard; deactivation revocation; manager BAC by-id), production-safety fixes (env superRefine boot guards for `COOKIE_DOMAIN`/`APP_BASE_URL`/`EMAIL_FROM`; mailer prod-fatal validation; `.gitignore` deploy artefacts; `/readyz` semantics), and data-quality fixes (tz-realistic seed check-ins; PDF binaries; dashboard org-tz anchoring). Stale "leave.reject backfill" line removed.
3. **`docs/TESTING.md`** — unit/integration counts refreshed; email line corrected; cert-reports pointer added.
4. **`docs/RUNBOOK.md`** — Mailhog row no longer claims email is unwired.
5. **`docs/RELEASE_NOTES.md`** — commit table extended; verification summary refreshed; "Manager leave-reject lands on the demo only after a re-seed" line removed (true at sprint time, no longer interesting after certification).
6. **`docs/PROD_SIGNOFF.md`** — supersession banner added.
7. **`docs/DEPLOYMENT_READINESS.md`** — supersession banner added.
8. **`docs/PROJECT_STATE.md`** — top banner marks the file as a v0.23 sprint snapshot superseded by certification reports.
9. **`docs/SECURITY_REPORT.md`** — new §5 maps each finding to its post-gate fix and updates the open-finding count to 0×P0/P1/P2.

No file was deleted. No certification snapshot (`docs/certification/*.md` written by an earlier phase) was edited — those are point-in-time evidence.

## 3. Sources for the updates (where each number / claim came from)

- **Unit 101/101, integration 248/248** — gates line in the Phase 13 security report (`docs/SECURITY_REPORT.md`), gates re-run during Phase 14 commit `3602723`, gates re-run during Phase 15 commit `d912745`.
- **Security finding closures** — `2883817` commit body + the four fix sites (`apps/api/src/common/sanitize-html.ts`, `announcements.service.ts`, `attendance/regularizations.service.ts`, `documents/documents.service.ts`, `rbac/users.service.ts`).
- **Production boot guards** — `apps/api/src/infra/config/env.ts` superRefine block + `test/infra/env.spec.ts` (7 cases) — Phase 14 §1.
- **CSRF-on-refresh fix** — `0bbc97d` (`@EnforceCsrf` on `/auth/refresh`).
- **Manager team-scope BAC by-id** — `3297aec` (employees + leave balances).
- **Tz-realistic seed + leave/attendance reconciliation** — `e9a557c`.
- **PDF binaries** — `8707dc8`.
- **Mailer prod-fatal validation** — `1d29173`.
- **Dashboard org-tz anchor** — `4b0d989`.

## 4. Findings

| ID | Severity | Finding | Recommendation |
| --- | --- | --- | --- |
| DOC-01 | P3 | `docs/PROJECT_STATE.md` is a v0.23 sprint snapshot whose §7 "Known issues" is point-in-time. A reader who lands there before the supersession banner could mistake it for current state | Banner added at top of file; if the doc proves confusing post-v1.0, fold the still-relevant architecture sections into a fresh `STATE.md` and archive the rest |
| DOC-02 | P3 | `docs/PROD_SIGNOFF.md` and `docs/DEPLOYMENT_READINESS.md` are early-sprint sign-offs that the current `PRODUCTION_SIGNOFF.md` supersedes | Banners added; remove on the next merge to `main` if the historical record is no longer needed |

No P0/P1/P2. No undocumented behavior, missing-doc, or contradiction between docs and code surfaced during this pass.

## 5. Gate

Doc-only phase. `pnpm format:check` re-run against the edited files only — clean. Code, tests, build untouched.
