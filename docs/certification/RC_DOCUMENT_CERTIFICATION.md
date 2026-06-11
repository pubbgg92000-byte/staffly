# RC-1 Inspection — Phase 7: Document Certification

Captured: 2026-06-11 · Org `staffly-demo`. Live probes with demo accounts
only; all probe artifacts (document row, version, audience, ack row, MinIO
object) deleted afterwards and baseline re-verified.

## 1. Live flow probes

| Flow | Result | Evidence |
| --- | --- | --- |
| Employee document list | 200 — 9 visible (3 required org docs + 6 distributed) | `GET /me/documents` as employee@acme.demo |
| Download (employee) | 200 — presigned MinIO URL → **354,208 bytes, valid `%PDF-1.4` magic** (Code of Conduct) | `GET /me/documents/:id/download-url` + byte fetch |
| Acknowledge | 201 — ack row created for employee+document; pendingTasks math consistent | `POST /documents/:id/acknowledge` |
| Presign upload (HR) | 200 — key minted under `uploads/<orgId>/document/<uuid>/…` (tenant-prefixed) | `POST /documents/files/presign-upload` |
| Binary upload | 200 — PUT to presigned MinIO URL | probe PDF |
| Create document (HR) | 201 (draft, `all_employees` audience) | `POST /documents` |
| Download round-trip | **bytes identical** to uploaded file (`cmp` clean, 209 bytes) | admin `download-url` + fetch |
| Storage-key tenant guard | ✅ proven live: create with an invalid `storageKey` → 400 `document.storage_key_invalid` (Phase 13 guard `2883817` working) | negative probe (accidental, kept as evidence) |

## 2. Storage integrity

| Check | Result |
| --- | --- |
| Missing binaries | **0 / 22** storage keys missing in bucket (`verify-demo` check #6, run this phase) |
| Broken keys | none — all keys org-prefixed; guard rejects foreign/malformed keys (above) |
| Broken downloads | none — presigned URLs 200 with correct content (two byte-verified downloads) |
| Orphan versions | 0 (`document_versions` ⟕ `documents`) |

## 3. Prior-issue re-test

| ID | Original defect | Re-test | Classification |
| --- | --- | --- | --- |
| ED-03 | Seeded documents had no binaries in MinIO (broken downloads) | 0/22 keys missing; two live downloads byte-verified (`%PDF` magic; upload/download `cmp` identical) | **FIXED** (holds) |

## 4. Probe cleanup

API soft-delete (204) + hard-delete of probe `documents` /
`document_versions` / `document_audiences` rows, probe ack row removed,
MinIO probe object removed (`mc rm`). Post-state: **22 documents · 0 ack
rows · 0 orphan versions** — baseline exact.

## 5. Verdict

**PASS.** Upload, download, acknowledge, and storage integrity all verified
live; ED-03 remains FIXED; the tenant storage-key guard demonstrably
enforces org-prefixed keys. No open document findings.
