# Staffly — Production Sign-off (v0.23.2 → Public Beta)

> **2026-06-11 supersession notice.** This is the prod-readiness-sprint sign-off
> dated 2026-06-10. The authoritative go/no-go after the full v1.0 master
> certification is [`PRODUCTION_SIGNOFF.md`](PRODUCTION_SIGNOFF.md) (Phase 14,
> 2026-06-11). The contents below remain accurate as the sprint-level summary
> at that point in time.

**Branch:** `feat/v0.23.2-prod-readiness` (local, **not pushed**) · **Base:** `main` @ `c22b53a` · **Date:** 2026-06-10
**Prepared as a go/no-go certification for a public *beta* (not GA).**

## Scope delivered
Email delivery (provider abstraction + wiring, Mailhog-verified), manager leave-reject
(team-scoped), `.gitignore` deploy-safety, deploy checklist, backup/restore drill, domain/
auth validation, and this certification suite. No new product modules.

## Gate results
| Gate | Result |
| --- | --- |
| Typecheck | ✅ 7/7 |
| Lint | ✅ 0 errors |
| Format | ✅ clean |
| Unit | ✅ 56/56 |
| Integration (PG18) | ✅ 242/242 (13 specs) |
| API build | ✅ success |
| Email (Mailhog) | ✅ 2/2 received (invite + reset) |
| Backup → restore | ✅ row counts + schema identical |
| CORS / CSRF / refresh / logout | ✅ all pass (localhost) |

Evidence: [`TEST_EVIDENCE.md`](TEST_EVIDENCE.md).

## Security posture
- Global guards: JWT → CSRF (double-submit) → Permission, behind a throttler keyed on
  `CF-Connecting-IP`. CSRF verified live (403 without token, 201 with).
- Cookies: `sf_access`/`sf_refresh` HttpOnly, refresh path-scoped to `/auth`, `SameSite=Lax`,
  `secure` in production. Refresh rotation with **reuse-detection** (old token → 401).
- RBAC: manager team-scoping enforced row-level for read **and** approve/reject.
- Helmet headers; real `/readyz` dependency probe; secrets via env only; no secrets tracked in git.

## Readiness score: **93 / 100**
Up from 90 (post-Phase-1/2). Email wired (+2) and deploy-safety/backup-drill (+1).
Remaining deductions: production-domain verification pending (−5), live email-provider send
unverified / R2 bucket not provisioned (−2).

| Target | Status |
| --- | --- |
| Investor / customer demo | **GO** |
| Public beta | **GO after** production-domain verification + provider-send smoke test (deploy-time) |
| Pilot / GA | **Fix first:** live cross-subdomain auth, R2 provisioning, restore-test on prod host, human UI/a11y pass |

## Blockers (must clear at deploy time)
1. **Production-domain cookie/CORS** — config correct, **not live-verified** (needs DNS).
2. **Live email send** — verified on Mailhog only; do a provider smoke test (Resend) post-deploy.
3. **R2 + Tunnel provisioning** — placeholders; bucket/token/CORS + tunnel id/creds to be created.
4. **Restore-test on the prod host** — drill passed locally; repeat against the prod DB once.

## Limitations (cannot be closed in this environment)
- No browser automation → **no UI screenshots**, no visual/mobile/a11y verification.
- No real DNS → cross-subdomain auth is config-validated only.
- No provider credentials → Resend/Mailgun adapters unit-tested, not live-sent.

## Recommendation
**GO for demo now; GO for public beta after the four deploy-time blockers are cleared and the
health-check section of `DEPLOY_CHECKLIST.md` passes live.** Nothing in this sprint is pushed or
deployed — production deployment requires explicit approval.

## Sign-off
- [ ] Engineering — gates green, code reviewed
- [ ] Product — beta scope + known limitations accepted
- [ ] Ops — `DEPLOY_CHECKLIST.md` completed, rollback rehearsed
