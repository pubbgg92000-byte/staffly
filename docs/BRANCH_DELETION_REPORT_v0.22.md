# Branch Deletion Report — `docs/project-state-v0.22`

Date: 2026-06-11 · Performed against repo @ `main` = `86e5aef` (unmodified).

> Uncommitted working-tree artifact. `main` was not modified by this deletion.

## 1. Target

| Field | Value |
| --- | --- |
| Branch | `docs/project-state-v0.22` |
| Tip commit | `6f42ef4` — `docs(project-state): refresh repository status to v0.22` |
| Local ref | `6f42ef489f2b6babb7449d3acb9773071c2b9757` |
| Remote ref | `6f42ef489f2b6babb7449d3acb9773071c2b9757` (identical) |
| Divergence from `main` | **1 ahead / 56 behind** |
| Files touched | **only** `docs/PROJECT_STATE.md` (+169/−101) — no code, config, or other docs |

## 2. Reason

Repository is now at **v0.23.2+** (plus the v1.0 certification program and
Phase A hardenings on `main`). The branch carries a stale **v0.22** snapshot
of `docs/PROJECT_STATE.md`. Merging an outdated state doc would overwrite the
current one with older information and create confusion.

## 3. Pre-deletion verification

### 3a. Content fully superseded — confirmed

`main` already contains a **newer** `docs/PROJECT_STATE.md`
(blob `31f1407`) snapshotted at **end of v0.23 + v0.23.1**, which explicitly
references the later v0.23.2 production-readiness sprint and v1.0
certification. It is strictly ahead of the branch's v0.22 snapshot.

### 3b. No unique content — confirmed

- An initial naive tag-diff flagged 4 tags (`v0.18.2-`, `v0.20`, `v0.20.2`,
  `v0.21`) as present in the branch doc but "missing" from main's. On
  inspection this was a **false positive** from formatting: main's
  "Tags shipped" table lists every one of them with fuller suffixes
  (`v0.18.2-announcements-documents-hardening`, `v0.20-rbac-backend`,
  `v0.20.2-archive-restore`, `v0.21-audit-viewer`) — and continues through
  `v0.22-notifications`, `v0.23-org-settings`, `v0.23.1-attendance-tz`.
- Every milestone in the branch doc is therefore represented in main's doc,
  which additionally covers two later sprints the branch predates.
- The branch's section structure (Milestones, Stack, Modules, Feature status,
  Quality gates "verified at v0.22", Roadmap, etc.) is a subset of what
  main's doc now covers at a later snapshot.
- The underlying milestones are independently preserved as **git tags**
  (`v0.20.2-archive-restore`, `v0.21-audit-viewer`, etc.), so no historical
  record is lost regardless.

**Conclusion:** the branch contains only obsolete documentation, fully
superseded by `docs/PROJECT_STATE.md` on `main`, with no unique content.

## 4. Deletion performed

```
git branch -D docs/project-state-v0.22        # local  → "Deleted branch (was 6f42ef4)"
git push origin --delete docs/project-state-v0.22   # remote → "[deleted] docs/project-state-v0.22"
```

| Ref | Status |
| --- | --- |
| local `docs/project-state-v0.22` | **deleted** (verified gone) |
| remote `origin/docs/project-state-v0.22` | **deleted** (verified gone) |
| `main` | **unmodified** (local == origin/main, 0/0) |

## 5. Recovery (if ever needed)

The branch is recoverable from the reflog / commit object for the standard
gc window:

```
git branch docs/project-state-v0.22 6f42ef489f2b6babb7449d3acb9773071c2b9757
```

After gc it is unrecoverable — acceptable, since the content is obsolete and
the milestones survive as tags.
