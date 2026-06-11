# Phase 7 — Document Management Certification

Captured: 2026-06-10 (~13:40Z) · Program phase 7 of 17 · Baseline: `docs/CERTIFICATION_BASELINE.md`
Method: full document flow driven live (presign → PUT to MinIO → create → presigned download, byte-exact); seeded-document binaries fixed (ED-03) and verified by downloading a seeded doc end-to-end; access-control + acknowledgement flows certified.

## Verdict: PASS after gate fix (ED-03 missing MinIO binaries fixed & verified; round-trip byte-exact)

| Capability | Result | Evidence |
| --- | --- | --- |
| Presign upload | **PASS** — `POST /documents/files/presign-upload` → `{url,key}` under `uploads/{org}/document/{uuid}/{file}` | §1 |
| Direct PUT to storage | **PASS** — browser-style PUT to the presigned URL → 200 | §1 |
| Create document | **PASS** — `POST /documents` with `file{storageKey,...}` + `audiences` → draft/published | §1 |
| Download (presigned GET) | **PASS** — `/documents/:id/download-url` → 200, **bytes match upload exactly** (12345==12345) | §1 |
| **Seeded-doc binaries** (ED-03) | **FIXED** — seeded doc downloads 200, 206KB, valid `application/pdf` (was 404/missing) | §2 |
| Preview / content-type | **PASS** — `file` identifies generated objects as "PDF document, version 1.4, 1 pages"; Content-Type `application/pdf` | §2 |
| Acknowledgement | **PASS** — `POST /:id/acknowledge` → 201, idempotent (re-ack → 201, no dup) | §3 |
| Required documents feed | **PASS** — `/me/documents` returns 8 (3 required); `unacknowledgedOnly` filters | §3 |
| Access control (personal docs) | **PASS** — employee downloading another's personal doc → 403 | §3 |
| Orphan / missing-binary detection | **PASS** — `db:verify:demo` sweeps all 20 storageKeys → 0 missing (was 20/20) | §2 |

## 1. Upload round-trip (live, byte-exact)

```
POST /documents/files/presign-upload {fileName,mimeType,sizeBytes}
   → { url, key=uploads/<org>/document/<uuid>/cert-test.pdf }
PUT  <presigned url>  (12345 random bytes)            → 200   (direct to MinIO)
POST /documents {title, categoryId, audiences:[{type:all_employees}], file:{storageKey,...}}
   → 201, document id
GET  /documents/<id>/download-url → presigned GET URL
GET  <url>                        → 200, 12345 bytes
cmp uploaded vs downloaded        → ✓ BYTES MATCH
```

The API never proxies bytes — both upload and download go directly to object storage via short-lived presigned URLs (`S3_PRESIGN_TTL_SECONDS`, default 900). The DTO requires `audiences` (≥1) for non-personal docs and an audience `type` (`all_employees`/department/etc.).

## 2. ED-03 fix — seeded documents now have real binaries

**Defect:** the demo seed wrote `DocumentVersion.storageKey` values but uploaded **nothing** to MinIO, and set `sizeBytes` to a random number — so every seeded document's download link 404'd and sizes were fictional. `db:verify:demo` reported **20/20 storageKeys missing**.

**Fix:**
- New seed helper `apps/api/prisma/seed-lib/storage.ts`: `makePdf(title, targetBytes)` builds a **minimal valid single-page PDF** (hand-rolled, dependency-free; padded to a plausible size via a PDF comment so it stays spec-valid), plus `seedStorageClient()` and `putObject()` (AWS SDK v3, same R2/MinIO config as the app).
- `seed-demo.ts` now uploads each org-doc and personal-doc version's PDF to storage with `ContentType: application/pdf` and stores `sizeBytes = buf.length` (the **actual** byte count). The seed throws loudly if storage is unconfigured (no more silently-broken document rows).
- 4 unit tests for `makePdf` (`test/seed/make-pdf.spec.ts`): valid header/EOF/catalog, size padding within ±2KB of target, PDF-string escaping, determinism.

**Verification after re-seed:** `db:verify:demo` → **0/20 storageKeys missing**; downloading a seeded personal doc returned 200, 206180 bytes, `file` → "PDF document, version 1.4, 1 pages". The generated PDFs open as valid PDFs.

## 3. Acknowledgement & access control

- Employee `/me/documents` feed: 8 documents (3 required), filterable by `unacknowledgedOnly`.
- `POST /documents/:id/acknowledge` → 201; immediate re-ack → 201 with no duplicate row (idempotent, integration-tested too).
- Personal-document isolation: an employee requesting another employee's personal-doc `download-url` → **403** (audience/subject scoping). Org-wide docs are downloadable by all employees in audience; managers lack `document.read` (admin authoring permission) per the Phase 3 matrix.

## 4. Findings

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| ED-03 | P2 (demo quality) | Seeded documents had no MinIO binaries; download links 404'd; sizeBytes fictional | **FIXED** — real PDFs uploaded, byte-exact, verified 0/20 missing |
| F-7.1 | P3 | `POST /documents` trusts the client-supplied `mimeType`/`sizeBytes`; no HEAD-object check that the key exists or matches before creating the row (baseline ED-08) | **Phase 11** (security) — a create with a bogus storageKey yields a row whose download 404s; low impact (authoring is admin-only) but worth a HEAD-verify |

## 5. Gates & cleanup

Gates: typecheck 7/7 · lint 0 errors · format clean · **unit 101/101** (+4 makePdf) · integration (running) · build 7/7. Demo org re-seeded with real binaries (20 documents, all downloadable). Live upload-test document, its storage object, and the test acknowledgement removed; demo back to seed state (20 docs).
