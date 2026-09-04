# Networking Tracker

A private networking tracker for the people you want to stay connected with at Berkeley. Each user signs up with email and password, then keeps their own list of contacts — name, company, role, where they met, notes, and a priority of high, medium, or low. Contacts can be created, edited, deleted, sorted, and filtered, and they persist in Neon Postgres across refreshes and devices. Every contact row is owned by exactly one user and that ownership is enforced by Postgres Row Level Security, not by the frontend: even if someone hit the public Data API directly with their own token, the database would only ever return their own rows.

**Live app:** _TODO: add Vercel URL after deployment_

---

## Table of contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database schema](#database-schema)
- [Authentication and RLS ownership](#authentication-and-rls-ownership)
- [Testing](#testing)
- [Deployment](#deployment)
- [Grading evidence](#grading-evidence)
- [Known limitations and next steps](#known-limitations-and-next-steps)

---

## Features

- **Sign up, sign in, sign out** with email and password via Neon Managed Better Auth
- **Private contact list** — each user only ever sees their own contacts
- **Add a contact** with name, company, role, where you met, notes, and priority
- **Priority** is restricted to `high`, `medium`, or `low` at the database level
- **Edit and delete** your own contacts, with a confirmation step before deleting
- **Sort** by name, company, where you met, or priority (click a column header to toggle direction)
- **Filter** by free-text search across name and company, and by priority
- **Persistence** — contacts are stored in Neon Postgres and survive refreshes, new sessions, and new devices
- **Clear states** — distinct loading, empty, success, and error states throughout
- **Responsive** — a sortable table on desktop, stacked cards on mobile

---

## Screenshots

_TODO: add screenshots after the live deployment. Required shots:_

| What | File |
| --- | --- |
| Sign-in and sign-out | `docs/screenshots/auth.png` |
| Creating, editing, deleting, and refreshing a contact | `docs/screenshots/crud.png` |
| Two-account privacy test | `docs/screenshots/privacy-test.png` |
| Invalid input failing safely | `docs/screenshots/validation-error.png` |
| Passing automated test output | `docs/screenshots/test-output.png` |

---

## Technology stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router) + TypeScript | First-class Vercel deployment, file-based routing, and TypeScript catches schema/shape mistakes at build time rather than in the browser. |
| Styling | Tailwind CSS v4 + shadcn/ui | shadcn/ui gives an accessible, consistent component system (dialogs, selects, tables, toasts) that is responsive by default, so the same code works on phone and desktop without a second layout. |
| Database | Neon Postgres | Serverless Postgres with real RLS support, so per-user isolation is enforced by the database engine rather than by application code. |
| Auth | Neon Managed Better Auth | Runs as a managed service, issues JWTs containing the user's `sub` claim, and is wired directly into the Data API so `auth.user_id()` resolves inside RLS policies. No auth infrastructure to maintain. |
| Data access | Neon Data API via `@neondatabase/neon-js` | A PostgREST-compatible REST layer over the same Postgres database. The SDK attaches the session JWT to every request automatically, so RLS applies to every read and write. |
| Validation | Postgres `CHECK` constraints (+ `zod` for UX) | The database is the trust boundary. `zod` in the form only exists to show friendly errors before a request is sent. |
| Testing | Vitest + `pg` | Fast test runner; `pg` lets the test assert against the real constraints in the real database instead of a mock. |
| Hosting | Vercel | Native Next.js target, zero-config builds from GitHub, and environment variables managed in the dashboard. |

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  Browser — Next.js client components         │
│                                              │
│  @neondatabase/neon-js client                │
│    client.auth.*          sign up/in/out     │
│    client.from('contacts') select/insert/    │
│                           update/delete      │
└───────────────┬──────────────────────────────┘
                │ HTTPS, JWT attached automatically
                │
    ┌───────────▼────────────┐   ┌──────────────────────────┐
    │  Managed Better Auth   │   │  Neon Data API           │
    │  (issues session JWT   │──▶│  validates JWT,          │
    │   with `sub` claim)    │   │  sets auth.user_id()     │
    └────────────────────────┘   └───────────┬──────────────┘
                                             │
                                 ┌───────────▼──────────────┐
                                 │  Neon Postgres           │
                                 │   contacts table         │
                                 │   • RLS policies         │
                                 │   • CHECK constraints    │
                                 └──────────────────────────┘
```

**Frontend and backend are separate systems.** The frontend is the Next.js app deployed on Vercel. The backend is Neon's managed platform — Postgres, the Data API that fronts it, and the Better Auth service — reached over HTTPS at its own URLs. This project deliberately does not hand-roll an Express server or a set of Next.js API routes in between, because that middle layer would add a second place to get authorization wrong without adding any security: the Data API already validates the JWT on every request, and Postgres already rejects any row that does not belong to the caller.

**Where the trust boundary sits.** Everything in the browser is untrusted — a user can open devtools and call the Data API directly with their own token. That is fine and expected here, because:

1. The Data API refuses any request without a valid JWT signed by Neon Auth.
2. RLS policies restrict every `SELECT`, `INSERT`, `UPDATE`, and `DELETE` to rows where `user_id` equals the caller's `auth.user_id()`.
3. `CHECK` constraints reject a blank name or an out-of-range priority regardless of which client sent the request.

The `zod` schema in `lib/contact-schema.ts` runs in the browser purely so the user sees "Name is required." immediately instead of waiting for a round trip. It is a convenience, not a control.

**Request flow for creating a contact:**

1. The user submits the form in `components/contact-form.tsx`.
2. `zod` validates locally; failures render inline and no request is sent.
3. `neon.from('contacts').insert({...})` sends a POST to the Data API with the session JWT.
4. The Data API validates the JWT and opens a Postgres session where `auth.user_id()` returns that user's ID.
5. The `contacts_insert` RLS policy checks `auth.user_id() = user_id`. The `user_id` column was never sent by the client — it is filled in by the column default `auth.user_id()`, so a client cannot forge ownership.
6. `CHECK` constraints validate name and priority.
7. On failure, Postgres returns an error code (`23514` for a constraint violation), which `lib/error-messages.ts` maps to a plain-language message shown in the form.

### Key files

| Path | Purpose |
| --- | --- |
| `lib/neon-client.ts` | Creates the `@neondatabase/neon-js` client with the two-URL object form (auth URL + Data API URL). |
| `lib/contact-schema.ts` | `zod` schema mirroring the DB constraints, for form-level UX validation. |
| `lib/error-messages.ts` | Maps Postgres/PostgREST error codes to user-facing messages. |
| `db/schema.sql` | The contacts table, constraints, RLS policies, and grants. The security model lives here. |
| `components/require-auth.tsx` | Client-side route guard; redirects unauthenticated visitors to `/sign-in`. |
| `components/contact-form.tsx` | Create/edit dialog with validation and error handling. |
| `components/contact-table.tsx` | Sortable table (desktop) and stacked cards (mobile), with delete confirmation. |
| `app/dashboard/page.tsx` | Loads contacts, owns sort/filter state, and composes the dashboard. |
| `tests/contacts-validation.test.ts` | Integration test asserting the database rejects invalid data. |
| `scripts/migrate.ts` | Applies `db/schema.sql` using `DATABASE_URL`. Local tooling only. |

---

## Local setup

**Prerequisites:** Node.js 20+ and a Neon account.

```bash
git clone <this-repo-url>
cd assign1
npm install
```

Then set up Neon. Either through the Console:

1. Create a project in the [Neon Console](https://console.neon.tech).
2. In the project's **Auth** tab, enable **Managed Better Auth** and the email/password provider. Copy the Auth URL.
3. In the project's **Data API** tab, enable the Data API. Copy the Data API URL.
4. From **Dashboard → Connect**, copy the pooled connection string for role `neondb_owner`.
5. Add `http://localhost:3000` to Neon Auth's trusted origins.

…or entirely from the CLI, which is how this project was configured:

```bash
npx neon@latest auth                                    # browser OAuth login
npx neon@latest neon-auth enable --project-id <id>      # Managed Better Auth
npx neon@latest data-api create --project-id <id>       # Data API
npx neon@latest neon-auth domain allow-localhost enable --project-id <id>
npx neon@latest neon-auth status --project-id <id>      # prints the Auth URL
npx neon@latest data-api get --project-id <id>          # prints the Data API URL
npx neon@latest connection-string --project-id <id> --role-name neondb_owner --pooled
```

Create `.env.local` from the template and fill in those three values:

```bash
cp .env.example .env.local
```

Apply the database schema (creates the table, constraints, RLS policies, and grants):

```bash
npm run db:migrate
```

Alternatively, paste the contents of `db/schema.sql` into the Neon SQL editor and run it.

Start the app:

```bash
npm run dev
```

Open http://localhost:3000.

---

## Environment variables

Copy `.env.example` to `.env.local`. `.env.local` is gitignored and must never be committed.

| Variable | Exposed to browser | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_NEON_AUTH_URL` | Yes | Managed Better Auth endpoint the client SDK calls for sign up, sign in, sign out, and session refresh. Public by design — it is an authentication endpoint, not a credential. |
| `NEXT_PUBLIC_NEON_DATA_API_URL` | Yes | Neon Data API endpoint. Public by design — every request against it requires a valid JWT and is filtered by RLS. |
| `DATABASE_URL` | **No** | Direct Postgres connection string. Used only by `scripts/migrate.ts` and the Vitest test, both of which run locally on Node. The deployed app never reads it, and it is not set in Vercel. |

The Postgres connection string never appears in frontend code, in the client bundle, or in Git history. Only variables prefixed with `NEXT_PUBLIC_` are inlined into the browser bundle by Next.js, and `DATABASE_URL` is deliberately not one of them.

---

## Database schema

Defined in [`db/schema.sql`](db/schema.sql).

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default auth.user_id(),
  name text not null,
  company text,
  role text,
  met_where text,
  notes text,
  priority text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_not_blank check (btrim(name) <> ''),
  constraint contacts_priority_valid check (priority in ('high', 'medium', 'low'))
);
```

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key, generated by `gen_random_uuid()`. |
| `user_id` | `text` | Owner of the row. `not null`, defaults to `auth.user_id()` — the ID from the caller's JWT. Never sent by the client. |
| `name` | `text` | Required. `not null` plus a `CHECK` that rejects whitespace-only values. |
| `company` | `text` | Optional. |
| `role` | `text` | Optional. |
| `met_where` | `text` | Optional. Where you met the person, e.g. "CS 186 study group". |
| `notes` | `text` | Optional free-text notes. |
| `priority` | `text` | Required, defaults to `medium`. A `CHECK` constraint restricts it to `high`, `medium`, or `low`. |
| `created_at` | `timestamptz` | Set on insert. |
| `updated_at` | `timestamptz` | Set on insert and refreshed by the `contacts_set_updated_at` trigger on every update. |

---

## Authentication and RLS ownership

**Authentication.** Neon Managed Better Auth handles sign up, sign in, and sign out. On success it issues a session JWT whose `sub` claim is the user's ID. The `@neondatabase/neon-js` client stores that session and attaches the token to every Data API request automatically.

**Ownership rule.** Inside a Data API request, Neon validates the JWT and exposes the caller's ID through `auth.user_id()`. Every policy on `contacts` compares that value to the row's `user_id`:

```sql
alter table contacts enable row level security;

create policy contacts_select on contacts for select to authenticated
  using ((select auth.user_id()) = user_id);

create policy contacts_insert on contacts for insert to authenticated
  with check ((select auth.user_id()) = user_id);

create policy contacts_update on contacts for update to authenticated
  using ((select auth.user_id()) = user_id)
  with check ((select auth.user_id()) = user_id);

create policy contacts_delete on contacts for delete to authenticated
  using ((select auth.user_id()) = user_id);

grant select, insert, update, delete on contacts to authenticated;
```

Four separate policies, one per operation, each scoped to the signed-in user. Two details matter:

- **`USING` vs `WITH CHECK`.** `USING` decides which existing rows a statement is allowed to see or touch. `WITH CHECK` validates the row *after* the write. The update policy has both, which is what stops a user from taking a row they own and reassigning `user_id` to someone else: `USING` lets them reach their own row, and `WITH CHECK` rejects the result because the new `user_id` would no longer match `auth.user_id()`.
- **`user_id` is never client-supplied.** The column default is `auth.user_id()`, and the app never sends the field, so a forged `user_id` on insert would be rejected by `contacts_insert`'s `WITH CHECK` anyway.

Because RLS is enabled and the grants are limited to the `authenticated` role, an unauthenticated request gets nothing: with no policy matching the anonymous role, Postgres denies by default.

---

## Testing

```bash
npm test
```

Nine tests across two files. Both run against the real Neon project — no mocks — so they verify the actual constraints and policies, not a local imitation of them.

### 1. Database validation — [`tests/contacts-validation.test.ts`](tests/contacts-validation.test.ts)

Connects directly to Postgres with `DATABASE_URL` and asserts that the **database itself** — not the form, not the client — rejects invalid data:

| Case | Expected |
| --- | --- |
| Name is only whitespace | Rejected by `contacts_name_not_blank` |
| `priority = 'urgent'` | Rejected by `contacts_priority_valid` |
| Valid contact | Accepted |

Each case runs inside a transaction that is rolled back, so the test leaves no data behind. It connects as the table owner, so it exercises the `CHECK` constraints specifically.

### 2. RLS ownership — [`tests/rls-ownership.test.ts`](tests/rls-ownership.test.ts)

This is the automated version of the two-account privacy test. It creates two throwaway users per run through the real Managed Better Auth service, gets real JWTs, and then drives the Data API over HTTPS exactly as the browser would — so it exercises genuine JWT validation and the real RLS policies:

| Case | Expected |
| --- | --- |
| Each user lists contacts | A sees 1 row, B sees 0 |
| B `SELECT`s A's row by its exact id | `[]` — the row is invisible |
| B `PATCH`es A's row | 0 rows changed; A's data intact |
| B `DELETE`s A's row | 0 rows deleted; A's row still there |
| A reassigns its own row's `user_id` to B | `403`, Postgres error `42501` — RLS violation |
| Unauthenticated request to the Data API | Rejected |

It also asserts that the `user_id` on a newly created contact equals the creator's JWT `sub`, proving the server — not the client — decides ownership.

### Output

```
 RUN  v4.1.11

 Test Files  2 passed (2)
      Tests  9 passed (9)
   Duration  2.63s
```

---

## Deployment

1. Push the repository to GitHub.
2. Import it into Vercel (or run `vercel`). No build configuration is needed — Vercel detects Next.js.
3. In Vercel's project settings, add the two public environment variables:
   - `NEXT_PUBLIC_NEON_AUTH_URL`
   - `NEXT_PUBLIC_NEON_DATA_API_URL`

   Do **not** add `DATABASE_URL` — the deployed app does not use it.
4. Deploy, then copy the resulting `*.vercel.app` domain.
5. Add that domain to Neon Auth's trusted origins so sign-in works in production.
6. Open the live URL in a private window and run the verification checklist below.

---

## Grading evidence

### Verification checklist

Verified locally against the live Neon project:

- [x] A user can sign up, sign in, and sign out
- [x] A user can add, view, edit, delete, sort, and filter contacts
- [x] Contacts survive a browser refresh (reloaded from Neon Postgres)
- [x] Sorting by priority is semantic (high → medium → low), not alphabetical
- [x] Search and priority filter compose correctly
- [x] User A cannot see or change User B's contacts
- [x] Invalid data fails safely with a clear message
- [x] `user_id` is set by the database, never sent by the client
- [x] Layout works at mobile width (table collapses to stacked cards)
- [x] `npm test` passes (9/9)
- [x] No secrets in frontend code or Git history

Pending deployment:

- [ ] App is live at a public URL
- [ ] Vercel domain added to Neon Auth trusted origins
- [ ] Full checklist re-run against the live URL

### Two-account privacy test

This is automated in `tests/rls-ownership.test.ts` (run `npm test`), and was also confirmed by hand. Running the attack directly against the Data API with two real user JWTs produced:

```
A sub: 9d9012d6-f602-4504-8d99-761ccc871e55
B sub: 5a7ca3ec-d189-4460-ab27-7c984e082051

A sees 1 row(s): [ 'Grace Hopper' ]
B sees 0 row(s): []

--- B attacks A's row 60e6f9c2-6d19-4a4b-8d99-865fc558b114 ---
B direct SELECT by id -> []
B PATCH  -> 200 []          (0 rows changed)
B DELETE -> 200 []          (0 rows deleted)

--- A tries to hand its row to B (ownership transfer) ---
A PATCH user_id -> 403 {"code":"42501",
  "message":"new row violates row-level security policy for table \"contacts\""}

A's row after all attacks: [{"name":"Grace Hopper"}]
```

Two things worth calling out:

- **B's writes return `200` with an empty array, not an error.** That is RLS working as designed: the `USING` clause simply matches no rows, so the statement legally affects nothing. The row is not merely hidden from the UI — it is unreachable.
- **A cannot give its own row away.** The `403 / 42501` is the `contacts_update` policy's `WITH CHECK` clause rejecting the row *after* the write, because the new `user_id` would no longer equal `auth.user_id()`.

To reproduce by hand in the browser, sign up as two users in separate private windows and confirm each dashboard only ever shows its own contacts.

### A note on trusted origins

Neon Auth rejects any authentication request that arrives without an `Origin` header it recognises (`MISSING_OR_NULL_ORIGIN`, HTTP 403). This is why `http://localhost:3000` must be allowed for local development and why the Vercel domain has to be added before sign-in works in production.

_TODO: attach UI screenshots from the live deployment._

---

## Known limitations and next steps

- **Route protection is client-side.** `components/require-auth.tsx` redirects unauthenticated visitors after the session resolves, which means the dashboard shell can flash briefly before redirecting. The data itself is never exposed — RLS blocks it regardless — but adding Next.js middleware backed by Better Auth's server integration would make the redirect happen before the page renders.
- **No pagination.** The dashboard loads all of a user's contacts at once and sorts/filters in memory. That is fine for a personal networking list; past a few thousand rows it would need server-side pagination and ordering through the Data API.
- **No email verification or password reset.** Managed Better Auth supports both; they are not wired into the UI.
- **No optimistic updates.** Every mutation re-fetches the full list. Simple and always correct, but a larger list would feel snappier with optimistic UI.
- **Tests create users they don't delete.** `tests/rls-ownership.test.ts` cleans up the contacts it creates but leaves its two throwaway auth users behind, so `neon_auth.user` accumulates a couple of rows per run. Cleaning those up needs the Better Auth admin API.
- **Tests depend on a live Neon project.** They are integration tests by design — that is what makes them meaningful evidence — but it also means they need network access and real credentials, so they cannot run in a CI job that has neither.
