# Staffly — Production Deploy Checklist (v0.23.2)

A runnable pre-flight for the public **demo/beta** deploy. Topology:
`Cloudflare edge (TLS) → Tunnel → Caddy(:8080) → NestJS API(:4000)` on the Mac Mini;
PG18 (Docker, loopback); portals on Vercel; R2 object storage. Detail in
[`DEPLOYMENT.md`](DEPLOYMENT.md); rollback in [`RUNBOOK.md`](RUNBOOK.md).

> Do not deploy until every **Blocking** box is checked. Items marked _(verify live)_
> can only be confirmed once real DNS resolves.

## 0. Prerequisites (host, one-time)
- [ ] Mac Mini: ≥ 20 GB free disk (host has hit StorageFull).
- [ ] Installed: Node 22, `pnpm@11.5`, Docker, `cloudflared`, `caddy`, `awscli`, `pm2` + `pm2-logrotate`.
- [ ] Cloudflare account with the `av.online` zone; R2 enabled.

## 1. DNS  _(Blocking)_
- [ ] `api.staffly.av.online` → routed via Cloudflare Tunnel (step 3).
- [ ] `admin.staffly.av.online` → Vercel (admin project).
- [ ] `staffly.av.online` (apex) → Vercel (employee project).
- [ ] All three share registrable domain `staffly.av.online` (required for the cookie). _(verify live)_

## 2. Cloudflare Tunnel  _(Blocking)_
- [ ] `cloudflared tunnel login`
- [ ] `cloudflared tunnel create staffly-demo`
- [ ] `cloudflared tunnel route dns staffly-demo api.staffly.av.online`
- [ ] `cp infra/cloudflared/config.example.yml ~/.cloudflared/config.yml` and fill tunnel id + creds path.
- [ ] Run as a launchd service. No inbound ports opened on the Mini.

## 3. Caddy  _(Blocking)_
- [ ] `caddy run --config infra/Caddyfile` (or `brew services`).
- [ ] Confirms loopback `:8080 → :4000`, `auto_https off`, forwards `CF-Connecting-IP`.

## 4. PostgreSQL 18  _(Blocking)_
- [ ] `export POSTGRES_PASSWORD='<strong-random>'`
- [ ] `docker compose -f infra/docker-compose.prod.yml up -d` (loopback `127.0.0.1:5433`, **never public**).
- [ ] `pnpm --filter @staffly/api prisma:migrate:deploy` (8 migrations; forward-only).
- [ ] Seed: `DEMO_SUPERADMIN_PASSWORD=… DEMO_HR_PASSWORD=… DEMO_MANAGER_PASSWORD=… deploy/reset-demo.sh`.

## 5. Cloudflare R2  _(Blocking for uploads)_
- [ ] Create bucket `staffly-demo`; create R/W API token (access key id + secret).
- [ ] Bucket **CORS**: origins `https://admin.staffly.av.online`, `https://staffly.av.online`; methods `GET,PUT`; headers `content-type, content-disposition`.
- [ ] Enable object versioning.

## 6. API env (`apps/api/.env`, never committed)  _(Blocking)_
- [ ] `NODE_ENV=production`, `PORT=4000`, `JWT_SECRET=<48+ random bytes>`
- [ ] `DATABASE_URL=postgresql://staffly:<pw>@127.0.0.1:5433/staffly?schema=public`
- [ ] `COOKIE_DOMAIN=.staffly.av.online`
- [ ] `CORS_ORIGINS=https://admin.staffly.av.online,https://staffly.av.online`
- [ ] `APP_BASE_URL=https://admin.staffly.av.online`
- [ ] R2: `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET=staffly-demo`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- [ ] Email: `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (or smtp); `EMAIL_FROM="Staffly <no-reply@staffly.av.online>"`
- [ ] `SENTRY_DSN` (API project)

## 7. Frontends (Vercel ×2)  _(Blocking)_
- [ ] Admin project root `apps/admin`, Employee project root `apps/employee`, each with its custom domain.
- [ ] Build env on both: `NEXT_PUBLIC_API_BASE_URL=https://api.staffly.av.online`, `NEXT_PUBLIC_ADMIN_BASE_URL`, `NEXT_PUBLIC_EMPLOYEE_BASE_URL`, `NEXT_PUBLIC_SENTRY_DSN` (changing `NEXT_PUBLIC_*` needs a redeploy).

## 8. First release
- [ ] `pm2 start ecosystem.config.cjs && pm2 save && pm2 startup`
- [ ] `deploy/release.sh` (tag → backup → migrate → build → reload → health-check; auto PM2 rollback on failure).

## 9. Health checks  _(Blocking)_
- [ ] `curl https://api.staffly.av.online/healthz` → `{"status":"ok"}` (200)  _(verify live)_
- [ ] `curl https://api.staffly.av.online/readyz` → `200` with `database:ok, storage:ok`  _(verify live)_
- [ ] Log in on **both** portals (proves cross-subdomain cookie + CORS).  _(verify live)_
- [ ] Upload a document (proves R2 presign round-trip).  _(verify live)_
- [ ] Trigger a password reset; confirm the email arrives via the configured provider.  _(verify live)_

## 10. Backups & monitoring
- [ ] Schedule `deploy/backup.sh` (launchd) → R2 `backups/postgres/`; 7 local dumps retained.
- [ ] **Run one restore-test** before declaring the demo stable (drill: see `TEST_EVIDENCE.md` §3).
- [ ] External uptime monitor → `/healthz` + `/readyz` + both portals.
- [ ] Sentry projects (api / admin / employee). Cloudflare WAF rate-limit on `api…/auth/*`.

## 11. Rollback (rehearse once)
- [ ] **Code:** `git checkout <deploy-tag>` → `deploy/release.sh` (PM2 keeps the prior process for instant reload).
- [ ] **Migration (forward-only):** restore the pre-migration dump (`backup.sh` runs before every migrate) + redeploy the prior tag.
- [ ] **Frontend:** Vercel → Promote a prior immutable build to Production.
- [ ] **Storage:** R2 versioning; MinIO read-only fallback until R2 verified.
