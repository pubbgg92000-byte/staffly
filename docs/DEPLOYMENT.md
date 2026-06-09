# Staffly — Public Demo Deployment Runbook (v0.23.2)

Target: a publicly accessible **demo** (not production) of Staffly.

```
Cloudflare edge (TLS/WAF) ─► Cloudflare Tunnel ─► Caddy(:8080) ─► NestJS API(:4000)   [Mac Mini]
                          └─► Vercel ─► Admin portal (admin.staffly.av.online)
                          └─► Vercel ─► Employee portal (staffly.av.online)
PostgreSQL 18 (Docker, loopback) ─ on the Mini
Cloudflare R2 (object storage) ─ external
Sentry ×3 (api / admin / employee)
```

Hosts:

| Host | Serves | Platform |
| --- | --- | --- |
| `staffly.av.online` | Employee portal | Vercel |
| `admin.staffly.av.online` | Admin portal | Vercel |
| `api.staffly.av.online` | NestJS API | Mac Mini via Cloudflare Tunnel |

**Invariant:** every browser-facing host shares the registrable domain
`staffly.av.online`, and the API sets `COOKIE_DOMAIN=.staffly.av.online`.
This is what lets the `sf_access` cookie flow from the portals to the API and
be read by the Vercel edge middleware. Break this (e.g. a `*.vercel.app`
preview domain) and login silently fails.

---

## 0. One-time prerequisites (Mac Mini)

- [ ] **Free disk** — keep `/` above ~20 GB free. OrbStack/Docker need headroom; the host has hit `StorageFull`.
- [ ] Install: Node 22, `pnpm@11.5`, Docker (OrbStack), `cloudflared`, `caddy` (`brew install caddy cloudflared`), `awscli`.
- [ ] `pm2` global (`pnpm add -g pm2`) + `pm2 install pm2-logrotate`.
- [ ] Cloudflare account with the `av.online` zone; R2 enabled.

---

## 1. PostgreSQL 18

```bash
export POSTGRES_PASSWORD='<strong-random>'
docker compose -f infra/docker-compose.prod.yml up -d
```

Loopback-bound on `127.0.0.1:5433`. Never expose it publicly.

## 2. Cloudflare R2 (fresh bucket — no MinIO migration)

1. Create bucket `staffly-demo`.
2. Create an R2 API token (Object Read & Write) → access key id + secret.
3. Bucket **CORS** (allow the portals to PUT/GET via presigned URLs):
   - Origins: `https://admin.staffly.av.online`, `https://staffly.av.online`
   - Methods: `GET`, `PUT`
   - Allowed headers: `content-type`, `content-disposition`
4. Enable **object versioning** (cheap rollback for demo files).
5. MinIO stays available locally as a read-only fallback until R2 is verified.

## 3. Cloudflare Tunnel (no port forwarding; home IP stays private)

```bash
cloudflared tunnel login
cloudflared tunnel create staffly-demo
cloudflared tunnel route dns staffly-demo api.staffly.av.online
cp infra/cloudflared/config.example.yml ~/.cloudflared/config.yml
#   → fill in the tunnel id + credentials path
```

## 4. Caddy (local proxy, kept for VPS portability)

```bash
caddy run --config infra/Caddyfile        # foreground; or `brew services` to persist
```

Tunnel ingress points at `http://127.0.0.1:8080` → Caddy → API `:4000`.

## 5. API env (`apps/api/.env` — NEVER committed)

| Var | Demo value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | `postgresql://staffly:<pw>@127.0.0.1:5433/staffly?schema=public` |
| `JWT_SECRET` | 48+ random bytes |
| `COOKIE_DOMAIN` | `.staffly.av.online` |
| `CORS_ORIGINS` | `https://admin.staffly.av.online,https://staffly.av.online` |
| `APP_BASE_URL` | `https://admin.staffly.av.online` |
| `S3_ENDPOINT` | `https://<acct>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | `staffly-demo` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2 token pair |
| `S3_PRESIGN_TTL_SECONDS` | `900` |
| `SENTRY_DSN` | API Sentry DSN |

(Generate secrets with `openssl rand -base64 36`.)

## 6. First deploy

```bash
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup        # persist across reboots
deploy/release.sh              # tag → backup → migrate → build → reload → health
```

## 7. Frontends (Vercel — 2 projects)

Project roots `apps/admin` and `apps/employee`, each with custom domain + build env:

```
NEXT_PUBLIC_API_BASE_URL=https://api.staffly.av.online
NEXT_PUBLIC_ADMIN_BASE_URL=https://admin.staffly.av.online
NEXT_PUBLIC_EMPLOYEE_BASE_URL=https://staffly.av.online
NEXT_PUBLIC_SENTRY_DSN=<portal Sentry DSN>
```

`NEXT_PUBLIC_*` is inlined at build — changing it requires a redeploy.

## 8. Monitoring

- External uptime monitor → `https://api.staffly.av.online/healthz` + `/readyz` + both portals.
- Sentry: 3 projects (api / admin / employee).
- Cloudflare WAF rate-limit rule on `api.staffly.av.online/auth/*` (defence-in-depth alongside the app throttler).

## 9. Backups

`deploy/backup.sh` daily via launchd/cron → R2 (`backups/postgres/`), 7 local
dumps retained. **Restore-test once** before calling the demo stable.

## 10. Rollback

- **Code:** `git checkout <deploy-tag>` → `deploy/release.sh` (PM2 keeps the prior process for instant reload).
- **Migration (forward-only):** restore the pre-migration dump (`backup.sh` runs before every migrate) + redeploy the prior tag.
- **Frontend:** Vercel "Promote to Production" → any prior immutable build.
- **Storage:** R2 versioning; MinIO read-only fallback until R2 verified.

---

## Demo accounts

> **Security:** admin & HR demo accounts must NOT use public/guessable
> passwords. Their passwords come from environment variables at seed time and
> are never committed. Only the employee/demo account may use a published
> credential so reviewers can log into the employee portal. The rich demo
> seed + the documented credential matrix are produced in **Phase B2 (Demo
> Readiness)** — this runbook will link the generated matrix there.

| Role | Email | Password source |
| --- | --- | --- |
| Super Admin | `superadmin@demo.staffly.av.online` | `DEMO_SUPERADMIN_PASSWORD` env (strong, private) |
| HR Admin | `hr@demo.staffly.av.online` | `DEMO_HR_PASSWORD` env (strong, private) |
| Manager | `manager@demo.staffly.av.online` | `DEMO_MANAGER_PASSWORD` env (strong, private) |
| Employee | `employee@demo.staffly.av.online` | published demo credential (read-only-ish role) |

Demo reset (Phase B2): `deploy/reset-demo.sh` re-seeds the rich demo company
(1 org, 25–50 employees, departments, designations, locations, attendance
history, leave requests, announcements, notifications, branding) so the
environment always looks actively used.
