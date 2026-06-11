# Attendance Exceptions — Branch Verification Review

Branch: `feat/v0.24.1-attendance-exceptions` · Commit: `1374981`
(`wip(attendance): v0.24.1 schema checkpoint — PENDING 238/238 verification`,
Arvind, 2026-06-09) · Reviewed: 2026-06-11 against `main` @ `86e5aef`.

> This report is an **uncommitted** working-tree artifact. `main` was not
> modified; the branch was not merged or pushed. The clean-integration check
> below ran on a throwaway branch off `main` that has been deleted.

## Verdict: **FAIL (as-is)** · schema change itself is **SOUND**

The branch **cannot be merged as-is**: it fails its own stated gate
(236/238 integration) and is **45 commits behind `main`** (forked at
`01b3b2a`, before the entire certification program). However, the schema +
migration content is correct and non-destructive — cherry-picked onto
current `main` it is **250/250 green**. The two branch failures are pure
staleness, not defects in this change.

## 1. Commit inspection

Single commit, self-described as a WIP checkpoint (the message itself says
"NOT the final Phase 1 commit … the full integration suite must pass
(238/238) … To resume: `git reset --soft HEAD~1` …"). No service-layer code
accompanies the schema: the new columns are **dormant** — nothing reads or
writes them yet. The bundled test additions exercise only **existing**
attendance behavior (policies CRUD, check-in/out, listing), not the new
early/emergency-checkout fields.

Divergence from `main`: **1 ahead / 45 behind**. `main` has no schema or
migration changes since the fork, so ordering/merge is clean.

## 2. Schema changes (`schema.prisma`) — all additive

| Change | Detail |
| --- | --- |
| +enum `CheckoutType` | `normal`, `emergency` |
| +enum `EarlyCheckoutReason` | `medical`, `personal`, `emergency`, `manager_approved` |
| +enum `AttendanceApprovalStatus` | `pending`, `approved`, `rejected`, `not_required` |
| `AttendancePolicy` +col | `earlyCheckoutThresholdHours Decimal(4,2)` NOT NULL **default 6.00** |
| `AttendanceRecord` +7 cols | `checkoutType?`, `earlyCheckoutReason?`, `earlyCheckoutNote?`, `approvalStatus?`, `reviewedBy?`, `reviewedAt?`, `reviewComment?` — **all nullable** |
| `AttendanceRecord` +index | `@@index([organizationId, approvalStatus])` |

No removals, renames, type narrowings, or new NOT-NULL on existing columns.

## 3. Migration SQL review (`20260609063913_v0_24_1_attendance_exceptions`)

```sql
CREATE TYPE "checkout_type" AS ENUM ('normal','emergency');
CREATE TYPE "early_checkout_reason" AS ENUM ('medical','personal','emergency','manager_approved');
CREATE TYPE "attendance_approval_status" AS ENUM ('pending','approved','rejected','not_required');

ALTER TABLE "attendance_policies"
  ADD COLUMN "early_checkout_threshold_hours" DECIMAL(4,2) NOT NULL DEFAULT 6.00,
  ALTER COLUMN "work_days" SET DEFAULT ARRAY[1,2,3,4,5]::SMALLINT[];   -- no-op (restates existing default)

ALTER TABLE "attendance_records"
  ADD COLUMN "approval_status" "attendance_approval_status",
  ADD COLUMN "checkout_type" "checkout_type",
  ADD COLUMN "early_checkout_note" TEXT,
  ADD COLUMN "early_checkout_reason" "early_checkout_reason",
  ADD COLUMN "review_comment" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reviewed_by" UUID;

CREATE INDEX "attendance_records_organization_id_approval_status_idx"
  ON "attendance_records"("organization_id","approval_status");
```

The generated SQL matches the schema exactly. The `work_days` line is a
Prisma normalization of an already-present default — functionally a no-op.

## 4. Gate results

### A. Branch as-is (45 commits stale)

| Gate | Result |
| --- | --- |
| typecheck | ✅ 7/7 |
| lint | ✅ 0 errors (105 warnings, pre-existing) |
| format:check | ✅ clean |
| unit | ✅ 49/49 *(note: main has 137 — branch predates 88 cert-era tests)* |
| build | ✅ 7/7 |
| **integration** | ❌ **236/238 — 2 FAILED** |

Both failures are in `employees.integration.spec.ts`, unrelated to
attendance:
- `departments CRUD … → GET /departments` expected 200, got **400**
  (deterministic — the branch lacks a departments/pagination fix that is on
  `main`).
- `employees > list: search …` → **socket hang up** (transient, same run).

`main`'s own integration suite is **248/248** (verified in Phase A), so these
endpoints pass on `main` — the failures are staleness, not this change.

### B. Schema change cherry-picked onto current `main` (decisive)

| Gate | Result |
| --- | --- |
| typecheck | ✅ 7/7 |
| build | ✅ 7/7 |
| **integration** | ✅ **250/250** (main's 248 + 2 from the bundled test additions) |

→ The migration applies cleanly on top of current `main` and breaks nothing.

## 5. Migration safety review

| Dimension | Assessment |
| --- | --- |
| **Destructive changes** | **None.** Only `CREATE TYPE`, `ADD COLUMN`, `CREATE INDEX`. No DROP/RENAME/type-narrowing. |
| **Data-loss risk** | **None.** 7 record columns nullable (instant metadata-only add, no rewrite). The one NOT-NULL policy column has a constant default → existing rows backfill to 6.00 safely (PG ≥11 fast-path, no rewrite). |
| **Lock / availability** | One concern: `CREATE INDEX` (non-`CONCURRENTLY`) takes a write-blocking lock on `attendance_records` for the build. At demo/beta scale (~2.4k rows) this is sub-second. At production scale (millions of rows) it briefly blocks check-in/out — see rollback/deploy note. |
| **Rollback feasibility** | **High.** Additive + dormant columns; reversible by drop, or safely left in place. |
| **Production impact** | Low. Dormant columns (no app code path), so behavior is unchanged until a feature lands. Only operational note is the index-build lock at scale. |

### Migration risk score: **2 / 10 (LOW)**

Additive, reversible, no data loss. The single point deducted-above-floor is
the non-concurrent index build on a potentially large table.

## 6. Merge recommendation

**Do NOT merge `feat/v0.24.1-attendance-exceptions` as-is.** It is a stale
(−45) WIP checkpoint that fails its own gate.

**Recommended path** (schema change is sound):
1. Re-create the change on top of current `main`:
   `git switch -c feat/v0.24.1-attendance-exceptions-v2 main` then
   `git cherry-pick 1374981` (verified to apply with **no conflicts**).
2. Drop the WIP framing — recommit as
   `feat(attendance): v0.24.1 attendance exceptions schema`.
3. Run full current gates (already verified green: typecheck, build,
   **integration 250/250**).
4. Decide on the dormant-columns question: this ships DB columns with **no
   service code using them**. Acceptable as an additive schema-prep step, but
   flag that the *feature* is incomplete — no early/emergency-checkout
   endpoint, validation, or HR-review flow exists yet.
5. For the **production** index, consider `CREATE INDEX CONCURRENTLY` (cannot
   run in Prisma's transactional migration — needs a separate manual step or
   a `--create-only` migration edited to split it out) if
   `attendance_records` is large at deploy time. Not needed for demo/beta.
6. Retire the stale branch after the v2 lands (see §8 cleanup).

## 7. Rollback plan

Prisma migrations are **forward-only** (no down-migrations; `deploy/release.sh`
takes a pre-migration backup). Three options, in order of preference:

1. **Leave-in-place (preferred):** the columns/enums/index are nullable and
   unreferenced by application code — inert. No urgent rollback needed; drop
   later in a tidy-up migration if the feature is abandoned.
2. **Reverse SQL** (safe, no data loss — nothing populated yet):
   ```sql
   DROP INDEX IF EXISTS "attendance_records_organization_id_approval_status_idx";
   ALTER TABLE "attendance_records"
     DROP COLUMN IF EXISTS "approval_status",
     DROP COLUMN IF EXISTS "checkout_type",
     DROP COLUMN IF EXISTS "early_checkout_note",
     DROP COLUMN IF EXISTS "early_checkout_reason",
     DROP COLUMN IF EXISTS "review_comment",
     DROP COLUMN IF EXISTS "reviewed_at",
     DROP COLUMN IF EXISTS "reviewed_by";
   ALTER TABLE "attendance_policies" DROP COLUMN IF EXISTS "early_checkout_threshold_hours";
   DROP TYPE IF EXISTS "attendance_approval_status";
   DROP TYPE IF EXISTS "early_checkout_reason";
   DROP TYPE IF EXISTS "checkout_type";
   ```
   (Reverse order: index → columns → types, since columns depend on the enum
   types.)
3. **Full restore:** restore the pre-migration dump that `release.sh` writes
   before every migrate — only warranted if combined with other failed
   changes.

## 8. Summary

| Item | Result |
| --- | --- |
| Branch merge-ready as-is | ❌ **NO** (236/238, −45 stale, WIP) |
| Schema/migration correctness | ✅ sound, additive |
| Integration on current `main` | ✅ **250/250** |
| Migration risk | **2/10 (LOW)** |
| Data-loss risk | none |
| Recommendation | **Rebase onto `main` → recommit non-WIP → merge**; do not merge this branch directly |

No merge performed. No push. `main` unmodified.
