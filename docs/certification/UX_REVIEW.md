# Phase 15 — UX Review (Admin + Employee Portals)

Captured: 2026-06-11 · Branch `feat/v0.23.2-prod-readiness` @ `3602723` · Portals: admin :3000, employee :3001 (live), shared UI in `packages/ui`
Method: **browser automation is not available in this environment** (no Playwright install in the workspace — documented limitation; no screenshots). Review performed as a manual-equivalent source audit of every route, state and a11y surface across both portals plus `packages/ui`, with live HTML fetches against the running dev servers to verify rendered claims (lang attribute, skip link, titles, auth redirects). Every claim cites `file:line` or a live response.

## Verdict: PASS with findings — strong, consistent foundations (designed empty states everywhere, skeletons on every list, toast+retry error pattern, mobile-first employee portal, permission-gated nav). No P0/P1. 3 × P2 (keyboard access on clickable rows/cards, no nested error boundaries, missing per-page titles), 7 × P3.

## 1. Scope & route inventory

- Admin portal: **35 routes** — dashboard, notifications, employees (list/new/detail/edit), attendance (+detail, regularizations), leave (+balances), holidays (+detail), announcements (list/new/detail), documents (list/new/detail/categories), org-structure, settings (organization/branding/roles×3/users/invites/audit-log), auth ×5.
- Employee portal: **16 routes** — dashboard, attendance, leave, documents (+detail), announcements (+detail), holidays, notifications, my-org, auth ×5, root redirect.
- Live spot-checks: unauthenticated `/dashboard` → 307 to sign-in on both portals; unknown route → 307 (middleware) — auth gating consistent.

## 2. Loading states

| Check | Admin | Employee |
| --- | --- | --- |
| Route-level `loading.tsx` | **NONE** (0 files) | **NONE** (0 files) |
| Inline skeletons during `isLoading` | PASS — every list page renders 4–6 skeleton rows (e.g. `employees/page.tsx:256-283`, `settings/audit-log/page.tsx:214-230`); detail pages + `WidgetCard` skeletons (`widget-card.tsx:57-61`) | PASS — all pages (`attendance/page.tsx:107`, `documents/page.tsx:147-155`, etc.) |
| Suspense fallbacks | **EMPTY** — `<Suspense>` wrappers (required by `useSearchParams`) pass no `fallback`, blank flash before hydration (`employees/page.tsx:462`) | Same (`leave/page.tsx:354-358`) |

Finding UX-04 (P3): no `loading.tsx`/fallbacks → blank content flash between navigation and client skeleton mount. Cosmetic at dev-server speeds; worth fixing for perceived performance.

## 3. Empty states — PASS (best-in-review surface)

Shared `EmptyState` component (`packages/ui/src/components/empty-state.tsx`) with icon/title/description/optional CTA used on **every** data-bearing page in both portals — 16 admin surfaces + 11 employee surfaces verified with citations (e.g. admin employees `employees/page.tsx:362-381`, employee documents with filter-aware messaging + "Show all" action `documents/page.tsx:157-176`). Permission-denied renders a designed "Forbidden" EmptyState on all 9 gated admin pages (`settings/audit-log/page.tsx:93-107` etc.). Dashboard has first-run CTA ("Add your first employee", `dashboard/page.tsx:162-170`).

## 4. Error states

- PASS — root `error.tsx` (retry + dashboard link + digest), `global-error.tsx`, `not-found.tsx` in both portals (`apps/admin/app/error.tsx:10-49`, employee same).
- PASS — uniform API error pattern: shared `ApiError` + `extractErrorMessage` (`packages/ui/src/api/client.ts:56-88`, `api/error.ts:43-69`); list pages toast with **Retry action**; mutations map backend codes to friendly strings (`FRIENDLY` maps, e.g. `settings/invites/page.tsx:57-65`); auth forms show inline `role="alert"` banners; client auto-refreshes on 401 (`client.ts:138-149`).
- **UX-02 (P2)** — zero nested `error.tsx`/`not-found.tsx` in any segment of either portal: a render error in one widget/page unmounts the entire app shell (sidebar/topbar) and lands on the root boundary, losing navigation context.

## 5. Accessibility

PASS items (both portals, shared primitives):
- `<html lang="en">` + skip-to-content link — verified in live HTML (:3000 sign-in).
- Form labeling: all sampled forms (sign-in, employee create/edit, leave apply/decide, regularization, document upload, invite/accept) use `Label htmlFor` + `aria-invalid`; filter selects use `aria-label`.
- `focus-visible:ring-2` on Button/Input/Select/OTP primitives (`packages/ui/src/components/ui/button.tsx:9` etc.); sidebar `aria-label="Primary navigation"` + `aria-current="page"`; auth submit buttons `aria-busy`.
- Sonner Toaster provides its own live region; `PasswordStrengthMeter` uses `aria-live="polite"`.

Findings:

| ID | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| UX-01 | **P2** | Clickable rows/cards keyboard-inaccessible: `<tr>`/`<article>`/`<li>` with `onClick`+`cursor-pointer` but no `role`/`tabIndex`/`onKeyDown`. Admin: 7 tables (`employees/page.tsx:290`, `documents/page.tsx:254`, `attendance/page.tsx:273`, `announcements/page.tsx:195`, `holidays/page.tsx:159`, `settings/roles/page.tsx:189`, `settings/audit-log/page.tsx:237`). Employee: announcement/document cards, leave rows (mobile+desktop), holiday items (`announcements/page.tsx:52`, `documents/page.tsx:44`, `leave/page.tsx:209,262`, `holidays/page.tsx:137,179`). Admin rows are partially mitigated by in-row View/Review links; employee cards mostly are NOT (card is the only target). | source |
| UX-05 | P3 | `StatCard` link: `focus:outline-none` with **no replacement ring** — invisible keyboard focus on dashboard stats (`packages/ui/src/components/stat-card.tsx:56`); topbar hamburger lacks `focus-visible:ring` (`layouts/topbar.tsx:30-33`) | source |
| UX-06 | P3 | Check-in/out status updates silently — no `aria-live`/`aria-busy` on the attendance widget region (`employee dashboard/page.tsx:92-155`, `attendance/page.tsx:107-169`); screen readers get no announcement on this highest-frequency action | source |
| UX-07 | P3 | `aria-busy` + `role="alert"` gaps on non-auth admin forms (employee form `employee-form.tsx:128,290`, document upload `documents/new/page.tsx:302,544`, invite/user dialogs); upload drop-zone div not keyboard-activatable (mitigated: `sr-only` file input is tabbable) (`documents/new/page.tsx:378`) | source |
| UX-08 | P3 | Label-association gaps in document-upload audience sub-selects — `<Label>` without `htmlFor`, Select is sibling (`documents/new/page.tsx:448,458,468,481,494`); same pattern in category dialog (`documents/categories/page.tsx:140`) | source |

## 6. Responsive behavior

- PASS — admin: desktop sidebar `hidden md:flex` + Sheet drawer from topbar hamburger (`layouts/topbar.tsx:27-44`); every data table wrapped in `overflow-x-auto` (14 tables cited); 150+ progressive column hides (`hidden md:table-cell` / `lg:` / `xl:`); responsive filter grids; content `max-w-[1440px]` with `px-4 md:px-8`.
- PASS — employee: explicitly **mobile-first** (`layouts/employee-layout.tsx:13`); fixed bottom-tab nav under `sm` with `aria-current` (`layouts/bottom-tab-nav.tsx:25`); dual layouts — stacked cards on mobile (`sm:hidden`), tables on desktop (`hidden sm:block` + `overflow-x-auto`) for attendance and leave (`attendance/page.tsx:186-251`, `leave/page.tsx:206-313`); full-width check-in button on phones (`w-full sm:w-auto`).

## 7. Navigation consistency

- PASS — 16 admin nav items permission-filtered client-side (`useFilteredNav`, `layouts/sidebar.tsx:20-37`); active state = exact-or-prefix match + `aria-current` + accent styling; collapsible state persisted (`sf:sidebar:collapsed`); `PageHeader` component on every authenticated page in both portals; back-links consistent (`ArrowLeft` pattern) though no structured breadcrumbs (acceptable at this depth).
- **UX-03 (P2)** — browser tab title is static `"Staffly"` on all authenticated pages in **both** portals (only auth pages export metadata; live-verified `Sign in · Staffly` on :3001). Tabs/history/screen readers can't distinguish routes. Low-effort fix (per-page `metadata`), real navigation cost.
- UX-09 (P3) — employee mobile nav: bottom tab renders `items.slice(0, 5)` (`bottom-tab-nav.tsx:21`, verified) so the 6th item **My Org** silently drops off phones (hamburger-only); `/holidays` has **no nav entry at all** — reachable only via the dashboard widget or URL (`app/(app)/layout.tsx:18-25`).
- UX-10 (P3) — employee document detail fetches `pageSize: 100` and filters client-side to find one document (`documents/[id]/page.tsx:58-60`, self-acknowledged in comment) — misses documents beyond 100 and wastes transfer; fine at demo scale.

## 8. Hygiene checks that PASSED both portals

- Disabled-while-submitting on every mutation button (no double-submit vectors found).
- Mutation → `invalidateQueries` revalidation everywhere incl. dashboard keys (no stale-after-mutate; `packages/ui/src/api/dashboard.ts:71-87`, `leave.ts:177-191`).
- Destructive actions behind type-to-confirm dialogs (offboard = employee code, deactivate = "DEACTIVATE") or `ConfirmDialog`.
- No silent `catch {}` error swallowing; no `undefined`-rendering risks (null → "—" dashes, lookups fall back to raw ID).
- Friendly backend-code → message maps on auth + leave + invite flows.

## 9. Findings summary

| ID | Sev | One-line | Portal |
| --- | --- | --- | --- |
| UX-01 | P2 | Clickable rows/cards not keyboard-accessible (no role/tabIndex/keydown) | both |
| UX-02 | P2 | No nested error boundaries — any render error drops the whole app shell | both |
| UX-03 | P2 | Static "Staffly" tab title on all authenticated routes | both |
| UX-04 | P3 | No `loading.tsx`; empty Suspense fallbacks → blank flash | both |
| UX-05 | P3 | StatCard/topbar focus indicators missing or removed | both |
| UX-06 | P3 | Check-in/out has no aria-live announcement | employee |
| UX-07 | P3 | aria-busy / role="alert" gaps on non-auth admin forms; drop-zone div | admin |
| UX-08 | P3 | Label `htmlFor` gaps in audience/category sub-forms | admin |
| UX-09 | P3 | My Org dropped from mobile bottom nav; Holidays has no nav entry | employee |
| UX-10 | P3 | Document detail = client-side filter over pageSize:100 fetch | employee |

None block demo or beta. UX-01/02/03 are the recommended pre-GA batch (small, mechanical fixes; UX-01 admin tables already have keyboard-reachable in-row links, employee cards need real work).

## 10. Limitation

`NOT VERIFIABLE LOCALLY` — visual rendering, contrast ratios, real device/viewport behavior, and screen-reader output were not exercised (no browser automation tooling in this environment). The findings above are source-derived plus live-HTML spot checks; a Playwright pass (axe-core + viewport screenshots) is the follow-up when tooling is available.
