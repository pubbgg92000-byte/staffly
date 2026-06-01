# 04 — Design System

> **Status:** Phase 4. Visual language, components, and patterns. Both portals consume `packages/ui` for design parity. shadcn/ui is the primitive layer; this doc describes our wrapper conventions and the custom composites we add on top.

---

## 1. Design Principles

1. **Calm over flashy.** HR data is often emotional (leave, attrition, documents). Aim for the visual register of Linear and Stripe, not consumer-flashy.
2. **Density when it earns its keep.** Lists, dashboards, and admin tables are dense; forms and onboarding are spacious.
3. **One primary action per screen.** Secondary actions are visually quieter.
4. **Disclosure over modal stacking.** Prefer side-sheets/drawers for details; reserve modals for blocking decisions.
5. **Status is a first-class type.** Every entity has a small, color-coded badge with stable copy.
6. **A11y is not a polish step.** Designed AA from the start; tested with axe in CI.

---

## 2. Tone of Voice

- **Direct, plain English.** Avoid HR jargon ("attrition" → "left the team" in employee-facing copy; "attrition" allowed in admin reports).
- **Sentence case** for everything except product name "PeopleFlow".
- **No exclamation points** except in genuine empty-state delights ("All caught up!").
- **Error copy never blames the user.** "We couldn't sign you in" ≫ "You entered the wrong password".
- **Be specific.** "Update profile photo" ≫ "Save changes".

---

## 3. Brand & Color Tokens

### 3.1 Brand

- **Primary brand color** (default org accent): `#0F172A` (Slate 900). Per-tenant override via `organizations.primary_color`.
- **Logo:** rendered at `apps/admin` and `apps/employee` topbar; org logo overrides the PeopleFlow mark.

### 3.2 Color tokens (CSS variables — defined in `packages/ui/src/styles/tokens.css`)

All colors are exposed as CSS custom properties using the **HSL channels-only** pattern that shadcn uses, so Tailwind utilities like `bg-primary/80` work.

```
:root {
  --background:        0 0% 100%;
  --foreground:        222 47% 11%;

  --card:              0 0% 100%;
  --card-foreground:   222 47% 11%;

  --popover:           0 0% 100%;
  --popover-foreground:222 47% 11%;

  --primary:           222 47% 11%;          /* tenant-overridable at runtime */
  --primary-foreground:0 0% 98%;

  --secondary:         210 40% 96%;
  --secondary-foreground:222 47% 11%;

  --muted:             210 40% 96%;
  --muted-foreground:  215 16% 46%;

  --accent:            210 40% 96%;
  --accent-foreground: 222 47% 11%;

  --destructive:       0 84% 60%;
  --destructive-foreground: 0 0% 98%;

  --success:           142 71% 45%;
  --success-foreground:0 0% 98%;

  --warning:           38 92% 50%;
  --warning-foreground:222 47% 11%;

  --info:              199 89% 48%;
  --info-foreground:   0 0% 98%;

  --border:            214 32% 91%;
  --input:             214 32% 91%;
  --ring:              222 47% 11%;

  --radius:            0.5rem;
}

.dark {
  --background:        222 47% 8%;
  --foreground:        210 40% 98%;

  --card:              222 47% 11%;
  --card-foreground:   210 40% 98%;

  --popover:           222 47% 11%;
  --popover-foreground:210 40% 98%;

  --primary:           210 40% 98%;
  --primary-foreground:222 47% 11%;

  --secondary:         217 33% 17%;
  --secondary-foreground:210 40% 98%;

  --muted:             217 33% 17%;
  --muted-foreground:  215 20% 65%;

  --accent:            217 33% 17%;
  --accent-foreground: 210 40% 98%;

  --destructive:       0 63% 31%;
  --destructive-foreground:210 40% 98%;

  --success:           142 71% 32%;
  --warning:           38 92% 50%;
  --info:              199 89% 48%;

  --border:            217 33% 18%;
  --input:             217 33% 18%;
  --ring:              212 27% 84%;
}
```

### 3.3 Tenant primary color

- On app boot, `/auth/me` returns `organization.primary_color`. The shell injects:
  `document.documentElement.style.setProperty('--primary', hexToHslChannels(primary_color))`.
- Fallback to default if hue contrast against `--primary-foreground` fails the AA contrast check (server validates on save).

### 3.4 Status color semantics

| Token | Use cases |
|---|---|
| `success` | approved, present, completed, active |
| `warning` | pending, late, half-day, expiring soon |
| `destructive` | rejected, absent, suspended, error, overdue |
| `info` | scheduled, on-leave, in-review, informational |
| `muted` | inactive, archived, draft |

Use `<StatusBadge variant>` (§ 6.6) — never raw color classes for status display.

---

## 4. Typography

- **Family:** `Inter Variable` via `next/font/google`, locally hosted. Fallback: `ui-sans-serif, system-ui, sans-serif`.
- **Monospace:** `JetBrains Mono` for codes, employee IDs, audit log values.
- **Variable axis:** weight 100–900.

### 4.1 Type scale (Tailwind config)

| Token | px | line-height | weight | usage |
|---|---|---|---|---|
| `text-xs` | 12 | 16 | 500 | meta, captions |
| `text-sm` | 14 | 20 | 500 | body, table cells, labels |
| `text-base` | 16 | 24 | 400/500 | inputs, paragraph |
| `text-lg` | 18 | 28 | 600 | sub-headings |
| `text-xl` | 20 | 28 | 600 | section headers |
| `text-2xl` | 24 | 32 | 600 | page titles |
| `text-3xl` | 30 | 36 | 700 | landing / empty heroes |
| `text-4xl` | 36 | 40 | 700 | rare hero copy |

- **Numerics** use `font-variant-numeric: tabular-nums` everywhere in tables/data.
- **Tracking:** default `tracking-normal`; titles `tracking-tight`; uppercase eyebrow labels `tracking-wider`.

---

## 5. Spacing, Layout & Iconography

### 5.1 Spacing

- Base unit **4 px**. Tailwind defaults used (`p-1 = 4px`, `p-2 = 8px`, ...).
- Section spacing: 24 / 32 / 48 px depending on density.

### 5.2 Layout

- Max content width on admin pages: `1440px` (`max-w-[1440px] mx-auto`).
- Standard page padding: `px-6 md:px-8 py-6`.
- Sidebar widths: collapsed `64px`, expanded `256px`.
- Topbar height: `56px`.
- Drawer/Sheet width: `lg` (`640px`) by default; `xl` (`800px`) for richer content.

### 5.3 Radii & shadows

- Card/popover radius `var(--radius)` = `0.5rem` (8 px).
- Buttons & inputs use the same radius.
- Shadow tokens (Tailwind defaults): `shadow-sm` for cards, `shadow-md` for popovers, `shadow-lg` for modals.

### 5.4 Iconography

- **Library:** Lucide (via shadcn).
- **Size:** 16 px in nav/buttons, 20 px in section headers, 24 px in empty states.
- **Stroke width:** 1.5.
- **Color:** inherits `currentColor`; default `text-muted-foreground` outside of active states.
- **Decorative icons** get `aria-hidden`. Functional icons have `aria-label`.

---

## 6. Component Catalog

> Each component is built on shadcn primitives. The wrapper lives in `packages/ui/src/components/<name>.tsx`. The catalog below names the component, its purpose, props (high-level), and key behaviors. Both portals use the same components.

### 6.1 Foundational (shadcn primitives we adopt)

`Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Combobox`, `MultiSelect`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Tabs`, `Tooltip`, `Popover`, `DropdownMenu`, `ContextMenu`, `Dialog`, `Sheet`, `Drawer`, `Card`, `Badge`, `Avatar`, `Calendar`, `DatePicker`, `Toast` (Sonner), `Alert`, `Separator`, `ScrollArea`, `Skeleton`.

Theming, sizing, and accessibility behaviors are inherited from shadcn defaults. Our wrapper layer adds:

- A single `size` prop (`sm | md | lg`) mapped to a consistent height (32/36/40 px) across Button/Input/Select.
- A `variant` prop standardized: `primary | secondary | ghost | destructive | outline`.
- A `loading` prop on `Button` that shows a 14-px spinner and disables the button.

### 6.2 `AppShell`

The chrome. Composes `Sidebar` + `Topbar` + main content.

**Props:** `nav: NavItem[]`, `topbar?: ReactNode`, `defaultCollapsed?: boolean`.

Behaviors: persists collapse state in `localStorage`; off-canvas on `<md`; tracks active route via `usePathname()`; renders breadcrumb derived from route tree.

### 6.3 `Sidebar`

Renders the nav defined in `01 § 6` / `01 § 7`. Each `NavItem` has:

```ts
{
  label: string;
  href?: string;
  icon: LucideIcon;
  permission?: string;            // hides if user lacks it
  badge?: () => Promise<number>;  // optional async counter
  children?: NavItem[];
}
```

- Auto-expands the parent of the active route.
- Badge counter renders a chip; if `0` then hidden.
- Section headers are passed as `NavSection` items.

### 6.4 `Topbar`

Composes: sidebar toggle, breadcrumb, global search (Cmd-K trigger), "+" quick-action menu (admin only), notifications popover, portal switcher (when applicable), user menu.

### 6.5 `PageHeader`

```tsx
<PageHeader
  title="Employees"
  subtitle="137 active · 4 invited"
  breadcrumb={[{ label: 'Workspace' }, { label: 'Employees' }]}
  actions={<Button>Add employee</Button>}
/>
```

- Sticks to top of content on scroll (optional `sticky` prop).
- Title `text-2xl font-semibold`; subtitle `text-sm text-muted-foreground`.

### 6.6 `StatusBadge`

```tsx
<StatusBadge variant="success">Approved</StatusBadge>
```

Variants: `success | warning | destructive | info | muted`. Always pairs an icon + label for color-blind safety. A registry maps domain statuses to variants:

```
approved      → success
pending       → warning
rejected      → destructive
cancelled     → muted
withdrawn     → muted
present       → success
absent        → destructive
half_day      → warning
on_leave      → info
holiday       → info
draft         → muted
scheduled     → info
published     → success
archived      → muted
invited       → info
active        → success
disabled      → destructive
offboarded    → muted
```

### 6.7 `StatCard`

Dashboard widget primitive.

```tsx
<StatCard
  label="Headcount"
  value={137}
  delta={{ value: +4, label: 'this month' }}
  icon={UsersIcon}
  href="/employees"
/>
```

- Number renders with `tabular-nums`.
- Delta colored success/destructive/muted with arrow glyph.
- Click navigates if `href`.

### 6.8 `KpiBar`

Row of compact stats, used at top of detail screens (Employee Detail, Document Detail).

### 6.9 `DataTable`

Heart of the admin portal. Built on TanStack Table + shadcn primitives.

**Features (all configurable via props):**

- Column definitions with `key`, `header`, `cell`, `sortable`, `align`, `width`.
- Per-column filters via `FilterBar` integration (text, select, multi-select, date range, boolean).
- Server-side sort / filter / pagination (cursor or offset).
- **Selection** with header checkbox; bulk-action bar slides in from bottom with count + actions.
- **Row actions** rendered as a dropdown trigger on hover (`MoreHorizontalIcon`).
- **Density** toggle: `comfortable | compact` (persists per table).
- **Column visibility** toggle dropdown.
- **Empty / loading / error** states swap into the body region.
- **Sticky header** while scrolling.
- **Pagination** controls (page size selector + counts).
- Keyboard: `j/k` move row focus, `x` toggle select, `Enter` open detail.

**Props (sketch):**
```ts
<DataTable
  columns={cols}
  data={rows}
  pagination={{ page, limit, total, onChange }}
  sort={{ field, direction, onChange }}
  filters={filtersConfig}
  selection={{ enabled: true, onChange }}
  bulkActions={[{ label: 'Deactivate', onClick }]}
  rowActions={(row) => [{ label: 'Edit', href: `/employees/${row.id}/edit` }]}
  empty={<EmptyState ... />}
  density="comfortable"
/>
```

### 6.10 `FilterBar`

Compose with `DataTable`. Renders chips:

- Text search input (debounced 300 ms).
- Filter chips with popover content per filter (single-select, multi-select, date-range, boolean).
- **Active filters** render as removable chips on the right.
- "Clear all" link when ≥ 1 filter active.
- URL-syncs filter state via the searchParams API.

### 6.11 `EmptyState`

```tsx
<EmptyState
  icon={UsersIcon}
  title="No employees yet"
  description="Invite your first teammate to get started."
  action={<Button>Add employee</Button>}
/>
```

A variant `EmptyState filtered` shows "No results match your filters" + Clear filters CTA.

### 6.12 `ConfirmDialog`

Wraps `Dialog` with:
- A `tone` prop (`destructive | neutral`).
- `typeToConfirm` (for destructive — user types the resource name).
- `requiresReason` (textarea required).

### 6.13 `FormField`

The single primitive every form uses. Wraps `react-hook-form`'s `useController` with shadcn primitives:

```tsx
<FormField name="email" control={control}
  label="Work email"
  description="They sign in with this address"
  required
  render={({ field }) => <Input {...field} type="email" autoComplete="email" />}
/>
```

- Renders label, optional description, control, and inline error.
- Sets `aria-invalid`, `aria-describedby` to error element.
- Required marker `*` with sr-only "(required)".

### 6.14 `Form` helpers

- `<Form schema={zod}>` provides a typed `FormProvider`.
- `<FormSection title="...">` for grouping.
- `<FormActions>` sticky footer in side-sheets.

### 6.15 `DateRangePicker`

Calendar with preset menu (Today, Yesterday, This week, Last 7 days, This month, Last month, This year). Returns `{ from: Date, to: Date }`.

### 6.16 `UploadDropzone`

Wraps `react-dropzone` + the presign flow.

- Drop or click; multi-file optional.
- Per-file progress bar; cancellable.
- Validates mime/size client-side before calling `/files/presign-upload`.
- Returns `FileRef[]` on completion via `onUploaded`.

### 6.17 `RichTextEditor`

Built on **Tiptap**. Toolbar: bold/italic/underline/strikethrough, H2/H3, lists, ordered list, quote, code, link, image (uses dropzone), horizontal rule.

- Output: sanitized HTML (DOMPurify equivalent).
- Used in Announcement Composer.

### 6.18 `CommandPalette`

`cmdk` based.

- `⌘K` / `Ctrl K` opens.
- Sections: People, Documents, Announcements, Settings (admin); People & Docs & Announcements & Holidays (employee), plus "Go to" routes.
- Server-backed search via `/search`; debounced; results cached for 30 s.

### 6.19 `AvatarStack`

Composes overlapping avatars for collections (e.g., audience preview).
- Up to N visible, "+M" tail.
- Tooltip on each avatar with display name.

### 6.20 `AcknowledgmentProgress`

Used on documents/announcements:

- Horizontal bar with % acked.
- Below: "92 / 137 acknowledged" + "View pending →".

### 6.21 `Stepper`

Used in Onboarding (`A-ONB-001`) and Employee bulk import.

- Linear, numbered steps with state (`upcoming | active | complete | error`).
- Each step renders title + optional summary line.

### 6.22 `LeaveTypePill`

Branded chip with the leave type's color + short code. Used in calendars and lists. Tooltip shows full name + balance available.

### 6.23 `Calendar*` (custom)

- `MonthCalendar` for org leave/holiday display: cells show stacked `LeaveTypePill`/`HolidayDot`; clicking cell opens a `Drawer` with the day's events.
- `WeekCalendar` (Phase 2-ready).

### 6.24 `KeyValueList`

Compact label/value rows used heavily in Employee Profile tabs.

- Striped optional.
- "Empty" placeholder `—` for null values; tooltip on truncation.

### 6.25 `InlineEdit`

Used for fields admins frequently edit without leaving the page (e.g., Department on Employee detail).
- Click → input shows; Enter saves; Esc cancels; auto-save on blur.

### 6.26 `Toaster` (Sonner)

- Top-right by default.
- `success | error | info | warning` with icons.
- Programmatic via `toast.success('Leave approved')`.

### 6.27 `Banner`

Persistent top-of-page banner (e.g., "Your account is in trial — 5 days left").
- Variants `info | warning | destructive`.
- Dismissible flag persisted in `localStorage` by banner id.

### 6.28 `Pagination`

Standalone pagination component used when `DataTable` is not the host (e.g., list of activity in detail tab).

### 6.29 Layout helpers

- `Section`, `Stack`, `Row`, `Grid` — thin Tailwind wrappers for legibility; not custom components.

---

## 7. Form Patterns

### 7.1 Stack

- **react-hook-form** for state + validation.
- **Zod** for schema; the same schema is exported and used by NestJS validation pipe.
- Shared schemas in `packages/types/forms/<feature>.ts`.

### 7.2 Validation conventions

- Errors shown **on blur** for new fields, **on change** once a field has been blurred once.
- Submit invalid → first invalid field receives focus.
- Server-returned `errors[]` with `field` set are mapped into RHF's `setError(field, { message })`.

### 7.3 Common field types

| Field | Component | Common rules |
|---|---|---|
| Email | `Input type=email` | RFC short-list; lowercase before submit; max 254. |
| Password | `Input type=password` + strength meter | min 10, ≥ 1 letter & 1 digit, zxcvbn score ≥ 3. |
| Phone | `Input` with libphonenumber-js E.164 normalization | per-country format on blur. |
| Name | `Input` | 1–60 chars, Unicode letters/marks/spaces/hyphens. |
| Code (employee/leave/department) | `Input` uppercase normalized | 1–32 chars, `[A-Z0-9_-]`. |
| Date | `DatePicker` | ISO; range checked in `superRefine`. |
| Date range | `DateRangePicker` | `from ≤ to`; max span per context. |
| Currency | `Input` with `numeric` mode | non-negative; precision 2; show `Money` chip with currency. |
| File | `UploadDropzone` | mime allowlist; ≤ 25 MB; one file unless multiselect. |
| Rich text | `RichTextEditor` | sanitized; max 50 KB. |

### 7.4 Dirty state & navigation

- Forms that are dirty intercept navigation with a `useBeforeUnload` confirm.
- Long forms (announcement composer) auto-save drafts every 2 s of inactivity to `localStorage` keyed by form id.

### 7.5 Submit affordances

- Primary button: verb + noun, e.g., "Invite employee", "Publish announcement".
- Loading state: spinner + same label.
- After success: toast + reset/redirect per screen spec.

---

## 8. Data Display Patterns

### 8.1 Tables

- **Default density:** comfortable on desktop, compact on `≤ md`.
- **Column widths:** explicit only when constraint is required; otherwise flex.
- **Number columns:** right-aligned with `tabular-nums`.
- **Long text:** truncate with tooltip on hover.
- **Action column** always last; icon-only with menu.

### 8.2 Lists

- For mobile breakpoints, tables degrade to a card-list with the same data and the same row-action menu.

### 8.3 Calendars

- Month view default; week view (Phase 2).
- Today highlight: outlined border + accent text.
- Weekend dimmed.
- Holidays render as a tinted band across the date cell.

### 8.4 Timelines

- Used in Audit Log, Leave approval history, Employee employment history.
- Vertical line on left; dots with icons; right-side content card.

---

## 9. State Inventory

Every list/detail must implement all four states.

| State | Pattern |
|---|---|
| **Loading** | `Skeleton` matching final layout. Show ≥ 300 ms (avoid flash). |
| **Empty (cold)** | `EmptyState` with icon + headline + sub + primary CTA. |
| **Empty (filtered)** | `EmptyState` "no results" + Clear filters. |
| **Error** | Banner + retry; never show stack traces; copy says "Couldn't load X — try again." |
| **Forbidden (403)** | Dedicated page; CTA to dashboard; never reveal resource existence. |

Reference copy for the most common screens is included in `05` and `06`.

---

## 10. Accessibility (WCAG 2.1 AA)

### 10.1 Color & contrast

- Foreground vs background ≥ 4.5:1 for body, ≥ 3:1 for large text and UI states.
- Tenant primary color is validated server-side against `primary-foreground` before saving; reject if AA fails.

### 10.2 Keyboard

- Every interactive element reachable via Tab; visible focus ring (`ring-2 ring-ring`).
- Modals trap focus; restore focus on close to the trigger.
- Skip-to-content link at top of every page.
- Common shortcuts: `⌘K` palette, `g` then key for navigation (e.g., `g e` → Employees in admin), `?` to show shortcuts.

### 10.3 Screen reader

- Use semantic HTML (`<main>`, `<nav>`, `<button>`, `<table>`, `<th scope>`).
- Live regions for toasts (`aria-live="polite"`) and bulk-action progress.
- Form fields associate labels and error messages via `aria-describedby`.

### 10.4 Motion

- Honor `prefers-reduced-motion`: disables non-essential transitions.

### 10.5 Touch targets

- Minimum 40×40 px hit area for icon buttons.

### 10.6 Testing

- Axe assertions integrated into Storybook + Playwright e2e.
- Manual passes (VoiceOver, NVDA) on each release.

---

## 11. Responsive Breakpoints

Tailwind defaults, with named usage:

| Token | px |
|---|---|
| `sm` | ≥ 640 |
| `md` | ≥ 768 |
| `lg` | ≥ 1024 |
| `xl` | ≥ 1280 |
| `2xl` | ≥ 1536 |

- Admin portal targets `lg+` primarily; mobile-usable but data-heavy tables degrade to card-lists.
- Employee portal is **mobile-first**; tables become cards under `md`.
- Sidebar collapses to off-canvas under `md`; under `sm` employee portal uses a bottom-tab nav.

---

## 12. Dark Mode

- Class strategy (`<html class="dark">`).
- Preference: user override (Topbar menu) → system (`prefers-color-scheme`) → default light.
- Stored in `users.preferences.theme` (`light | dark | system`).
- All custom components are tested in both modes; Storybook ships a parallel preview.

---

## 13. Loading & Skeleton Patterns

| Surface | Skeleton |
|---|---|
| Stat card | bar + small label bar |
| Table row | n rows of grey bars matching widths |
| Detail header | title bar + 3 KPI shapes |
| Calendar | month grid with neutral cells |
| Chart | rectangle with axis hint |

---

## 14. Tokens Map (Tailwind config)

`tailwind.config.ts` extends with:

```ts
colors: {
  border: 'hsl(var(--border))',
  input: 'hsl(var(--input))',
  ring: 'hsl(var(--ring))',
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  primary: {
    DEFAULT: 'hsl(var(--primary))',
    foreground: 'hsl(var(--primary-foreground))',
  },
  // secondary, muted, accent, destructive, success, warning, info, card, popover ...
},
borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
```

---

## 15. Storybook conventions

- Every component in `packages/ui` ships at least one story.
- Stories file: `<Component>.stories.tsx` next to the component.
- Variants: `Default`, `Dark`, `Loading`, `Empty`, `Error` where applicable.
- Knobs for `size`, `variant`, `disabled` etc.
- Axe addon enabled; failures break CI.

---

## 16. Cross-reference

- Component names declared here are referenced verbatim in `05-admin-portal.md` and `06-employee-portal.md` per-screen specs.
- Color tokens here are referenced by chart libraries and the calendar component for stable theming.
- Accessibility checklist is the verification criterion in `07-development-roadmap.md` Definition of Done.
