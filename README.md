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

Then set up Neon:

1. Create a project in the [Neon Console](https://console.neon.tech).
2. In the project's **Auth** tab, enable **Managed Better Auth** and the email/password provider. Copy the Auth URL.
3. In the project's **Data API** tab, enable the Data API. Copy the Data API URL.
4. From **Connection Details**, copy the pooled connection string.
5. Add `http://localhost:3000` to Neon Auth's trusted origins.

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

Runs [`tests/contacts-validation.test.ts`](tests/contacts-validation.test.ts) with Vitest. The test connects directly to Postgres with `DATABASE_URL` and asserts that the **database itself** — not the form, not the client — rejects invalid data:

1. Inserting a contact whose name is only whitespace fails with a `contacts_name_not_blank` violation.
2. Inserting a contact with `priority = 'urgent'` fails with a `contacts_priority_valid` violation.
3. Inserting a valid contact succeeds.

Each case runs inside a transaction that is rolled back, so the test leaves no data behind. It connects as the table owner, which means it exercises the `CHECK` constraints specifically; ownership isolation is verified separately by the two-account test below.

_TODO: paste passing `npm test` output here._

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

- [ ] App is live at a public URL
- [ ] A user can sign up, sign in, and sign out
- [ ] A user can add, view, edit, delete, sort, and filter contacts
- [ ] Contacts survive a browser refresh
- [ ] User A cannot see or change User B's contacts
- [ ] Invalid data fails safely with a clear message
- [ ] `npm test` passes
- [ ] No secrets in frontend code or Git history

### Two-account privacy test

Run against the live deployment in two separate private browser windows:

1. Sign up as User A. Add a contact, e.g. "Grace Hopper".
2. In a second private window, sign up as User B. The dashboard shows the empty state — User A's contact is not visible.
3. As User B, add a different contact. User A's list, after a refresh, still shows only their own.
4. Copy User A's contact `id` from the network tab. As User B, attempt a direct Data API call against that row:

   ```js
   // In User B's browser console
   await neon.from('contacts').select('*').eq('id', '<User A contact id>')
   // → returns [] : the row is invisible to User B under contacts_select

   await neon.from('contacts').update({ name: 'hacked' }).eq('id', '<User A contact id>')
   // → affects 0 rows : contacts_update's USING clause never matches
   ```

5. Sign back in as User A and confirm the contact is untouched.

_TODO: attach screenshots of steps 2 and 4._

---

## Known limitations and next steps

- **Route protection is client-side.** `components/require-auth.tsx` redirects unauthenticated visitors after the session resolves, which means the dashboard shell can flash briefly before redirecting. The data itself is never exposed — RLS blocks it regardless — but adding Next.js middleware backed by Better Auth's server integration would make the redirect happen before the page renders.
- **No pagination.** The dashboard loads all of a user's contacts at once and sorts/filters in memory. That is fine for a personal networking list; past a few thousand rows it would need server-side pagination and ordering through the Data API.
- **No email verification or password reset.** Managed Better Auth supports both; they are not wired into the UI.
- **The automated test covers validation, not RLS.** It connects as the table owner to test `CHECK` constraints. Testing RLS automatically would require minting two real user JWTs in the test, which is worth doing next — it would turn the manual two-account check into a regression test.
- **No optimistic updates.** Every mutation re-fetches the full list. Simple and always correct, but a larger list would feel snappier with optimistic UI.
