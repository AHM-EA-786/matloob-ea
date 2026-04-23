# EA Portal — Build Notes

**Project:** Matloob Tax & Consulting — Client + Internal Portal
**Firm:** Matloob Tax & Consulting · Abdul H. Matloob, EA · (508) 258-9890 · 758B Falmouth Road, Hyannis, MA 02601 · contact@matloob-ea.com
**Build date:** April 2026
**Stack:** React 18 + Vite + wouter (hash routing) · Express + Drizzle + SQLite · Tailwind + shadcn/ui

---

## Quick Start

```bash
# 1. Copy env template and adjust secrets
cp .env.example .env
# Generate a 64-char hex key:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Install deps (already done)
npm install

# 3. Development
npm run dev              # Express + Vite on :5000

# 4. Production build
npm run build            # → dist/public (client) + dist/index.cjs (server)
npm start                # Serves built bundle
```

## Test Credentials

| Role   | Email                      | Password        | Notes                                          |
|--------|----------------------------|-----------------|------------------------------------------------|
| Admin  | `abdul@matloob-ea.com`     | `ChangeMe!2026` | `mustChangePassword=true` → forced to `/admin/settings` on first login |
| Client | (self-register at `/signup`) | —             | Status = `pending`; admin approves at `/admin/clients` before sign-in works |

The initial admin is seeded from `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` env vars (defaults shown above).

---

## Architecture

### Database (SQLite + Drizzle, sync `.get/.all/.run`)

7 tables defined in `shared/schema.ts`:

1. **users** — `id, email, passwordHash, role('admin'|'client'), status('pending'|'active'|'suspended'), firstName, lastName, phone, mustChangePassword, mfaEnabled, mfaSecret, createdAt, updatedAt`
2. **sessions** — `id, userId, tokenHash (SHA-256 of 32-byte random), expiresAt, createdAt, lastActiveAt, ip, userAgent` — 2-hour sliding idle timeout
3. **files** — `id, ownerId, uploaderId, fileName, mimeType, size, storagePath, iv (AES-GCM), authTag, category, visibility, createdAt`
4. **auditLogs** — `id, userId, actorEmail, action, target, details (JSON), ip, userAgent, createdAt`
5. **resources** — `id, source, category, title, summary, url, pubDate, isPinned, createdAt, updatedAt` — unique on `(source, url)`
6. **messages** — `id, senderId, recipientId, subject, body, readAt, createdAt`
7. **clientNotes** — `id, clientId, authorId, body, createdAt`

Migrations run idempotently at startup via `runMigrations()` in `server/storage.ts`.

### Security Stack (IRS Pub 4557 aligned)

| Safeguard | Implementation |
|-----------|----------------|
| Password hashing | `bcrypt` cost 12 |
| Session tokens | 32-byte `crypto.randomBytes`, stored in DB as SHA-256 hash; raw token in `Authorization: Bearer …` header only |
| Session storage | **React Context in-memory only** — no `localStorage`, `sessionStorage`, or cookies |
| Session timeout | 2 hours sliding idle; `lastActiveAt` updated on every authed request |
| MFA | TOTP via `speakeasy` (window: 1), QR via `qrcode` data URL — endpoint scaffolded; UI wiring available on admin settings |
| Brute force | In-memory map, 5 failed attempts per email → 15-minute lockout |
| File encryption | AES-256-GCM with per-file IV derived from `FILE_ENCRYPTION_KEY` (accepts 32-byte utf8 or 64-char hex); auth tag stored in DB |
| Upload limits | `multer` memory storage, 50 MB cap, allow-list: PDF/PNG/JPG/XLSX/DOCX/CSV/TXT |
| Audit trail | Every auth/file/admin event → `auditLogs` with actor email, action, target, JSON details, IP, UA |
| Admin banner | `/admin` dashboard shows HTTPS + Pub 4557 posture with green security badge |

### Routing (wouter v3, hash-based)

All routes prefixed with `#/`. Guards via `<RequireRole role="admin|client">`:

- **Public:** `/`, `/signin`, `/signup`, `/forgot-password`
- **Client:** `/client`, `/client/files`, `/client/resources`, `/client/profile`, `/client/messages`
- **Admin:** `/admin`, `/admin/clients`, `/admin/clients/:id`, `/admin/files/upload`, `/admin/resources`, `/admin/audit`, `/admin/settings`

`mustChangePassword=true` forces admin → `/admin/settings`, client → `/client/profile`.

### Design System

- **Palette:** Navy `#1a2744` (219 45% 19%), Gold `#b8860b` (42 90% 38%), Ivory `#faf9f6` (40 25% 97%)
- **Type:** DM Serif Display (h1–h3) + DM Sans (body) + JetBrains Mono (code) via Google Fonts
- **Dark mode:** Respects `prefers-color-scheme`; toggle in client & admin layouts
- **Components:** shadcn/ui primitives styled with Tailwind HSL tokens

### Compliance — EA Language

All copy uses IRS-approved phrasing:
- "Enrolled to practice before the Internal Revenue Service"
- **No** use of "certified" with the EA designation
- **No** mention of education, degree, UMass, or years of experience
- **No** claim of IRS employer/employee relationship
- Security page cites IRS Pub 4557 as basis for safeguards

---

## File Inventory

**Total TypeScript/TSX files:** 87 (non–node_modules/dist)

### Server (`server/`)
- `index.ts` — bootstraps Express, runs migrations, seeds admin, loads resources
- `routes.ts` — all REST endpoints + `requireAuth` / `requireAdmin` middleware
- `storage.ts` — `DatabaseStorage` class (IStorage) with Drizzle sync queries
- `auth.ts` — bcrypt, TOTP, session token helpers, login rate limiter
- `crypto.ts` — AES-256-GCM `encryptBuffer` / `decryptToBuffer` / `deleteFile` / string helpers
- `speakeasy.d.ts` — minimal ambient type declarations
- `data/portal.db` — SQLite database (WAL mode, gitignored via storage path)
- `data/files/` — encrypted file blobs (gitignored)
- `data/resources.json` — upserted at startup; currently `[]` awaiting resources-updater subagent

### Client pages (`client/src/pages/`)
- **Public:** `landing.tsx`, `signin.tsx`, `signup.tsx`, `forgot-password.tsx`, `not-found.tsx`
- **Client portal:** `client/{layout,dashboard,files,resources,profile,messages}.tsx`
- **Admin portal:** `admin/{layout,dashboard,clients,client-detail,files-upload,resources,audit,settings}.tsx`

### Client infra
- `App.tsx` — Router with `useHashLocation`, AuthProvider, RequireRole guards, ThemeInit
- `contexts/auth.tsx` — AuthProvider: user/token state, signin/signup/signout/refreshMe, wires 401 → `/signin`
- `lib/queryClient.ts` — `setAuthToken` / `getAuthToken` / `setOn401`; Authorization header on apiRequest + getQueryFn; FormData support
- `components/logo.tsx` — shield SVG with gold **M**; dark/light variant

### Shared
- `shared/schema.ts` — Drizzle table defs + Zod insert schemas (cast via `as any` for union types, `$inferInsert` for insert types)

---

## Environment Variables

See `.env.example`:

```
FILE_ENCRYPTION_KEY=      # 64-char hex OR 32-byte utf8 string; dev fallback SHA-256(seed) if missing
SESSION_SECRET=           # Reserved for future HMAC use
INITIAL_ADMIN_EMAIL=abdul@matloob-ea.com
INITIAL_ADMIN_PASSWORD=ChangeMe!2026
```

**Before deploying to production:** set a strong `FILE_ENCRYPTION_KEY` — it is **not** rotated, and changing it will render existing encrypted files unreadable.

---

## Known Limitations

1. **Forgot password flow** — the `/forgot-password` page displays the firm's phone/email contact info rather than dispatching a reset email. No SMTP transport is wired. Admin can manually reset a client's `mustChangePassword` flag from `/admin/clients/:id`.
2. **Resources feed** — `server/data/resources.json` is currently an empty array. The resources-updater subagent (separate task) is expected to populate it with `{id, source, category, title, summary, url, pubDate, isPinned}` items. The server upserts by `(source, url)` on each startup, preserving any admin-toggled `isPinned` state.
3. **MFA UI polish** — TOTP enrollment endpoints and `speakeasy`/`qrcode` are implemented server-side. The admin settings page shows current MFA state; full QR-code enrollment UX is scaffolded and ready to extend.
4. **DOM nesting warning (non-breaking)** — wouter v3's `<Link>` auto-renders an `<a>`, so a few `<Link><a>…</a></Link>` patterns log a React hydration warning in the console. Functionality is unaffected. Future polish: move `className` / `data-testid` onto `<Link>` directly and drop the inner `<a>`.
5. **No email transport** — account approvals, password resets, and new-file notifications are surfaced inside the portal (messages + audit log) rather than emailed.
6. **In-memory rate limiting** — the 5-fail / 15-min login lockout uses a process-local map. If you run multiple Node instances, migrate this to the DB or Redis.

---

## Verified

- [x] `npm run build` — clean (client 424 kB / 132 kB gzip, server 1.1 MB CJS)
- [x] `npx tsc --noEmit` — clean
- [x] Landing, sign-in, sign-up, forgot-password pages render with firm branding
- [x] Admin sign-in succeeds → redirects to `/admin/settings` (mustChangePassword forced flow)
- [x] Admin settings page renders navy sidebar + gold ADMIN badge + security banner + all 5 Pub 4557 safeguards

Screenshots captured in `_screenshots/`: `landing.png`, `signin.png`, `signup.png`, `forgot.png`, `admin-after-signin.png`, `admin-after-signin2.png`.

---

## v2 Updates — Resources Search + Live News (April 2026)

Fixes two reported regressions on `/client/resources` and `/admin/resources`:

### Bugs Fixed

1. **Resources never loaded into SQLite.** `loadResourcesFile()` did `JSON.parse(raw) as any[]` and bailed if not an array — but `server/data/resources.json` is `{ lastUpdated, items: [...] }`. The 48 seeded resources silently failed to upsert, leaving the DB empty on every boot. The loader now accepts both shapes: `Array.isArray(parsed) ? parsed : parsed?.items`.
2. **MA DOR items never rendered.** The TypeScript schema types `source` as `"IRS" | "MA_DOR"`, but `resources.json` stores `"MA DOR"` (with a space). The client's `r.source === "MA_DOR"` check never matched, so MA DOR cards were filtered out. Fixed by normalizing at load time via `normalizeSource(raw)` which maps `IRS`/`"MA DOR"`/`"MA_DOR"`/`"Massachusetts DOR"` to the canonical union.
3. **Search only looked at title + summary and required one contiguous substring.** Rewritten to be multi-term AND matching across `title + summary + category + source`, debounced 200ms, with an `X` clear button.

### New: `ResourcesBrowser` Filters

- Debounced full-text search (200ms) — multi-term AND (`"1040 schedule c"` finds items with both terms).
- Source dropdown: All / IRS / MA DOR.
- Category dropdown: auto-populated from live data (All / forms / publications / guidance / news).
- **Pinned only** switch.
- Result count: "Showing X of Y resources".
- Empty state card with "Clear filters" button when a search yields zero results.
- Source badges: navy `hsl(219 45% 19%)` for IRS, gold `hsl(42 90% 40%)` for MA DOR.
- Every card has a visible "Open ↗" external link button. Title also links out. All links open in a new tab with `rel="noopener noreferrer"`.
- News items (`category === "news"`) are hidden from the main browser because they live in the Live News panel at the top.

### New: Live IRS & MA DOR News Panel

Top of `/client/resources` and `/admin/resources`. Auto-refreshes every 5 minutes via React Query's `refetchInterval`, re-renders every 60s to keep relative timestamps current.

**Server side:**

- New file `server/news-fetcher.ts` with:
  - `fetchIrsNewsroom()` — uses `rss-parser` against IRS newsroom RSS feeds (tries `/uac/newsroom-rss`, `/rss-feeds/tax-news`, `/rss-feeds/news-and-announcements-for-tax-professionals` in order).
  - `fetchMaDorNews()` — fetches `https://www.mass.gov/orgs/massachusetts-department-of-revenue/news`, parses anchors pointing to `/news/`, `/info-details/`, or `/press-release/`.
  - `refreshLiveNews()` — concurrently fetches both, upserts each as `{source, category:"news", title, summary, url, pubDate}` through `storage.upsertResource` (unique on `source+url`, so re-fetching is idempotent).
  - `maybeRefreshLiveNewsAsync()` — fire-and-forget background trigger with a 15-minute TTL and in-flight coalescing.
  - `lastRefreshStatus()` — exposes `{ok, error, at}` for UI consumption.
- New `rss-parser` dependency (pinned via `npm install rss-parser`).
- `GET /api/resources` now triggers `maybeRefreshLiveNewsAsync()` and returns `{resources, news:{lastRefreshAt, ok, error}}`. The response shape is backwards-compatible for `resources`.
- `GET /api/resources/news` — news-only feed, last 30 days, newest first, capped at 20.
- `POST /api/admin/resources/refresh-news` — admin-only force refresh, audited as `resource_news_refresh`.

**Client side:**

- `LiveNewsPanel` component in `client/src/pages/client/resources.tsx`, imported by the admin page too.
- Shows the 10 most recent news items with relative timestamps (`"2h ago"`), source badges, 1-line summaries, and an external-link icon.
- "Last updated: Xm ago" indicator. If `news.ok === false` or the query errors, shows an amber `⚠ showing cached` indicator — **never blanks out**.
- A red pulsing dot turns grey when offline (cached mode).
- Admin gets a "Refresh news" button in the page header that calls the force-refresh endpoint.

### Constraint Compliance

- No `localStorage`, `sessionStorage`, or cookies anywhere. Debounce and tick state are plain React `useState` + `setTimeout`. Query cache is in-memory per existing queryClient.
- Uses React Query (`useQuery` + `refetchInterval`) as required.
- Uses existing shadcn primitives: `Card`, `Input`, `Select`, `Switch`, `Button`, `Badge`.
- Navy / gold / ivory design system preserved. Hash routing via wouter untouched.

### Files Touched

- `server/routes.ts` — loader fix, source normalization, live-news endpoints + background refresh.
- `server/news-fetcher.ts` — new.
- `client/src/pages/client/resources.tsx` — rewritten (adds `LiveNewsPanel`, `ResourcesBrowser` now supports multi-term search, source/category filters, pinned toggle, empty state, result count).
- `client/src/pages/admin/resources.tsx` — imports `LiveNewsPanel`, adds "Refresh news" mutation + button.
- `package.json` / `package-lock.json` — `rss-parser@^3.13.0`.

### Verified

- [x] `npm run build` — clean.
- [x] `npx tsc --noEmit` — clean.
- [x] Fresh SQLite DB loads 48 resources from `resources.json` (was 0 before).
- [x] `GET /api/resources` returns items with `source` normalized to `"IRS"` / `"MA_DOR"`.
- [x] `GET /api/resources/news` returns the 2 seeded news items from the last 30 days, sorted newest first.
- [x] Live upstream RSS fetch fails gracefully in the sandbox (no outbound internet) and the UI correctly shows "showing cached" without blanking.
- [x] Browser test: admin sign-in → `/admin/resources` → search `"schedule c"` returns 10, `"1040"` returns 1, clear-filters restores 42. Source filter restricts to 18 MA DOR items. Pinned-only shows 5. Empty-state card appears for nonsense queries.
- [x] Screenshots: `_screenshots/admin-resources-v2.png`, `admin-resources-empty.png`.


---

## v3 updates — Email Notifications + Onboarding Polish (Apr 21, 2026)

### Summary

Wired real email notifications via Google Workspace SMTP (nodemailer) into every client-facing touchpoint, and gave the admin a much more prominent onboarding/pending-approvals experience on the dashboard. Added a real password-reset flow end-to-end. All SMTP config is environment-driven — if env vars are missing the mailer no-ops and writes `email_skipped_no_config` to the audit log rather than crashing.

### New environment variables

Documented in full in `.env.example`. Abdul must set:

```
SMTP_USER=contact@matloob-ea.com
SMTP_PASSWORD=<16-char Google Workspace app password, no spaces>
MAIL_FROM_EMAIL=contact@matloob-ea.com
ADMIN_NOTIFY_EMAIL=contact@matloob-ea.com
PORTAL_BASE_URL=https://www.perplexity.ai/computer/a/matloob-ea-portal-BCBrVOunQ6GjG8Chky1vgA
```

Optional (have safe defaults): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `MAIL_FROM_NAME=Matloob Tax & Consulting`.

Google Workspace app-password URL: `https://myaccount.google.com/apppasswords` (requires 2-Step Verification to be on for `contact@matloob-ea.com` first).

### New files

- `server/mailer.ts` — nodemailer transporter singleton, 9 template functions, `sendMail` / `sendMailAsync` helpers. Every send path writes either `email_sent`, `email_failed`, or `email_skipped_no_config` to `audit_logs` so the firm always has a paper trail. Templates use inline-CSS navy/gold letterhead, bilingual HTML + plaintext, and every footer carries the Circular 230 disclosure plus the "Enrolled to practice before the IRS" line. Never uses the word "certified" with the EA designation.
- `client/src/pages/reset-password.tsx` — new page, reads the reset token out of the hash query string, POSTs to `/api/auth/reset-password`, routes to sign-in on success.
- `client/src/components/admin-onboarding-banner.tsx` — 4-step "Getting started" timeline shown on the admin dashboard only when `totalClients === 0`. Dismissible; dismissal state is plain React (no localStorage, per platform rules).

### New database table

- `password_resets` (id, userId, tokenHash, expiresAt, usedAt, createdAt) — migration is idempotent (`CREATE TABLE IF NOT EXISTS`) and runs on server boot from `server/storage.ts`. Tokens are 32-byte random hex, SHA-256 hashed at rest, 1-hour expiry, single-use.

### New endpoints

- `POST /api/auth/forgot-password` — always returns `{ ok: true }` regardless of whether the email exists (enumeration-safe). Writes `password_reset_requested` or `password_reset_requested_noop` to the audit log. Sends the reset email when a real user matches.
- `POST /api/auth/reset-password` — validates token hash + expiry + `usedAt` is null, updates the password, marks the token used, deletes all other outstanding tokens for that user. Writes `password_reset_completed`.
- `GET /api/config/email` — quick probe endpoint that returns `{ configured: boolean, from?: string }` so the admin settings page can show current SMTP status without leaking credentials.

### Email templates (all in `server/mailer.ts`)

1. `signupReceivedClient` — confirms client their account is pending review.
2. `signupAlertAdmin` — tells Abdul a new client signed up, with a direct link to the pending-approvals queue.
3. `accountApprovedClient` — sent when admin moves a client `pending → active`.
4. `accountSuspendedClient` — sent when admin moves a client `active → suspended`.
5. `fileUploadedToClient` — sent when admin uploads a file for the client.
6. `fileUploadedByClient` — sent to the admin when a client uploads a file.
7. `passwordResetEmail` — reset link, 1-hour expiry, single-use.
8. `newMessageClient` — sent when admin posts a new message in a thread.
9. `newMessageAdmin` — sent when client posts a new message.

All nine return `{ subject, html, text }` and share a single letterhead helper, so brand changes only need one edit.

### Where email sends are wired

- Signup (client) → `signupReceivedClient` + `signupAlertAdmin`.
- Admin client status change → `accountApprovedClient` OR `accountSuspendedClient`.
- File upload (admin uploads for client) → `fileUploadedToClient`.
- File upload (client uploads for admin) → `fileUploadedByClient`.
- Forgot password → `passwordResetEmail`.
- New message → `newMessageClient` or `newMessageAdmin` depending on sender role.

All calls use `sendMailAsync` without guarding on config — the mailer itself decides whether to actually send or log `email_skipped_no_config`. If SMTP fails at runtime the error is caught and logged as `email_failed`; the HTTP response is never affected.

### New audit-log actions

`email_sent`, `email_failed`, `email_skipped_no_config`, `password_reset_requested`, `password_reset_requested_noop`, `password_reset_completed`.

### UX changes

**Signup flow (client)** — `client/src/pages/signup.tsx` rewritten around a `phase` state. On successful submit it replaces the form with a confirmation card: "Thanks for signing up — we've received your request", a 3-item "What to expect" checklist, a phone + email contact card, and a "Return to home" button. Branches on the `emailSent` flag returned by the API so the copy is honest when SMTP isn't configured yet.

**Forgot-password page** — `client/src/pages/forgot-password.tsx` replaced the static placeholder with a real functional form that POSTs to `/api/auth/forgot-password` and always shows the same "if that email exists, we've sent a reset link" confirmation.

**Admin dashboard** (`client/src/pages/admin/dashboard.tsx`):
- New prominent gold-bordered `PendingApprovalsCard` with the pending count and a direct link to `/admin/clients?filter=pending`.
- New `AdminOnboardingBanner` — 4-step timeline, only renders when `totalClients === 0`, dismissible in-session.

**Admin layout** (`client/src/pages/admin/layout.tsx`) — sidebar polls `/api/admin/stats` every 60s and shows a gold badge with the live pending count next to "Clients".

**Admin clients page** (`client/src/pages/admin/clients.tsx`):
- `readFilterFromUrl()` reads `filter=…` from both `window.location.search` AND the hash's query-string segment, so deep links work regardless of whether the query appears before or after the `#`.
- Pending rows get big **Approve** (emerald) + **Suspend** (destructive) buttons.
- Active rows get a **Suspend** button; suspended rows get a **Reactivate** button.
- Pending banner at the top of the list when the `pending` filter is active.

**Auth context** — `signup()` now returns `{ ok: true, emailSent: boolean }` so the UI can render the right confirmation copy.

### Files modified

- `shared/schema.ts` — added `passwordResets` table + insert schema + type.
- `server/storage.ts` — `password_resets` migration + 4 storage methods (`createPasswordReset`, `getPasswordResetByTokenHash`, `markPasswordResetUsed`, `deletePasswordResetsForUser`).
- `server/routes.ts` — forgot/reset-password endpoints, `/api/config/email`, email sends wired into signup / status change / file upload (both directions) / messages.
- `client/src/contexts/auth.tsx` — `signup()` return shape change.
- `client/src/App.tsx` — registered `/reset-password` route.
- `client/src/pages/signup.tsx`, `client/src/pages/forgot-password.tsx`, `client/src/pages/admin/dashboard.tsx`, `client/src/pages/admin/layout.tsx`, `client/src/pages/admin/clients.tsx` — UX updates described above.
- `.env.example` — full SMTP block with Google Workspace app-password instructions and links.

### Constraint compliance

- No `localStorage` / `sessionStorage` / cookies anywhere in the new code. Banner dismissal and signup phase state are plain React `useState`.
- Hash routing with `wouter` untouched. New routes follow the same `Route path="/reset-password"` pattern.
- No throw path from email. Every send is wrapped so a missing SMTP config or a transient 5xx from Google never affects the HTTP response.
- Circular 230 compliance: every template footer carries the full IRS Enrolled Agent disclosure and the "Enrolled to practice before the Internal Revenue Service" line; the word "certified" is never used with the EA designation.
- Navy / gold / ivory + DM Sans design system preserved across all new components and email templates.

### Verified

- [x] `npx tsc --noEmit` — clean.
- [x] `npm run build` — clean.
- [x] Server boots without any SMTP env vars set — signup returns `emailSent: false` and writes `email_skipped_no_config` to the audit log rather than crashing.
- [x] Playwright QA:
  - Signup form → confirmation page renders with the new "Thanks for signing up" card and checklist.
  - Admin login → dashboard shows the new pending-approvals gold card and sidebar badge with the live count.
  - Clicking the pending-approvals card (or navigating directly to `/admin/clients?filter=pending` / `/?filter=pending#/admin/clients`) opens the clients page with the pending filter already applied — only pending rows visible, pending banner at top, Approve + Suspend buttons on each row.
  - Clicking Approve on a pending row fires the API call, shows a success toast, and the pending count drops from 4 → 3 live without a reload.
- [x] Screenshots: `_screenshots/v3-signup-form.png`, `v3-signup-confirmation.png`, `v3-admin-dashboard.png`, `v3-admin-dashboard-final.png`, `v3-clients-pending.png`, `v3-clients-pending-filter-final.png`, `v3-clients-pending-via-link-final.png`, `v3-clients-after-approve.png`.
