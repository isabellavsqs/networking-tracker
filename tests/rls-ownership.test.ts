// End-to-end proof that Row Level Security isolates one user's contacts from another's.
//
// This is the automated version of the assignment's two-account privacy test. It talks to
// the real Managed Better Auth service and the real Data API over HTTPS — the same path the
// browser uses — so it exercises the actual JWT validation and the actual RLS policies in
// db/schema.sql, not a mock.
//
// It creates two throwaway users per run, has User A create a contact, then tries every way
// User B could reach that row. Requires NEXT_PUBLIC_NEON_AUTH_URL and
// NEXT_PUBLIC_NEON_DATA_API_URL in .env.local.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const AUTH_URL = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
const DATA_API_URL = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

// Neon Auth rejects requests without an Origin header (trusted-origins enforcement),
// so every auth call below sends one that is registered for local development.
const ORIGIN = "http://localhost:3000";

interface TestUser {
  email: string;
  jwt: string;
  userId: string;
}

/** Signs up a throwaway user and returns a Data API JWT for them. */
async function createUser(label: string): Promise<TestUser> {
  const email = `rls-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = `TestPassw0rd!${Math.random().toString(36).slice(2, 10)}`;

  const signUp = await fetch(`${AUTH_URL}/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password, name: `RLS Test ${label}` }),
  });
  if (!signUp.ok) {
    throw new Error(`sign-up failed for ${email}: ${signUp.status} ${await signUp.text()}`);
  }

  const cookie = (signUp.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");

  const tokenRes = await fetch(`${AUTH_URL}/token`, {
    headers: { cookie, origin: ORIGIN },
  });
  if (!tokenRes.ok) {
    throw new Error(`token fetch failed for ${email}: ${tokenRes.status}`);
  }

  const { token } = (await tokenRes.json()) as { token: string };
  const claims = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString()
  ) as { sub: string };

  return { email, jwt: token, userId: claims.sub };
}

/** Calls the Data API as a given user. */
function asUser(user: TestUser, path: string, init: RequestInit = {}) {
  return fetch(`${DATA_API_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${user.jwt}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

describe.skipIf(!AUTH_URL || !DATA_API_URL)("RLS contact ownership", () => {
  let userA: TestUser;
  let userB: TestUser;
  let contactId: string;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createUser("a"), createUser("b")]);

    // User A creates a contact. Note that user_id is never sent — the column
    // default auth.user_id() fills it in from A's JWT.
    const res = await asUser(userA, "/contacts", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        name: "Grace Hopper",
        company: "Berkeley EECS",
        priority: "high",
      }),
    });
    expect(res.status).toBeLessThan(300);
    const [row] = (await res.json()) as { id: string; user_id: string }[];
    contactId = row.id;

    // The server, not the client, decided who owns this row.
    expect(row.user_id).toBe(userA.userId);
  }, 60_000);

  afterAll(async () => {
    if (contactId && userA) {
      await asUser(userA, `/contacts?id=eq.${contactId}`, { method: "DELETE" });
    }
  });

  it("gives each user a separate list", async () => {
    const aRows = (await (await asUser(userA, "/contacts?select=id")).json()) as unknown[];
    const bRows = (await (await asUser(userB, "/contacts?select=id")).json()) as unknown[];

    expect(aRows).toHaveLength(1);
    expect(bRows).toHaveLength(0);
  });

  it("hides User A's row from User B even when B knows its exact id", async () => {
    const res = await asUser(userB, `/contacts?id=eq.${contactId}&select=*`);
    expect(await res.json()).toEqual([]);
  });

  it("blocks User B from updating User A's row", async () => {
    const res = await asUser(userB, `/contacts?id=eq.${contactId}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ name: "HACKED" }),
    });
    // The UPDATE policy's USING clause matches no rows, so nothing is changed.
    expect(await res.json()).toEqual([]);

    const check = await asUser(userA, `/contacts?id=eq.${contactId}&select=name`);
    expect(await check.json()).toEqual([{ name: "Grace Hopper" }]);
  });

  it("blocks User B from deleting User A's row", async () => {
    const res = await asUser(userB, `/contacts?id=eq.${contactId}`, {
      method: "DELETE",
      headers: { prefer: "return=representation" },
    });
    expect(await res.json()).toEqual([]);

    const check = await asUser(userA, `/contacts?id=eq.${contactId}&select=name`);
    expect(await check.json()).toHaveLength(1);
  });

  it("stops User A from reassigning their row to User B", async () => {
    const res = await asUser(userA, `/contacts?id=eq.${contactId}`, {
      method: "PATCH",
      body: JSON.stringify({ user_id: userB.userId }),
    });

    // The UPDATE policy's WITH CHECK clause rejects the row after the write,
    // because the new user_id would no longer match auth.user_id().
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("42501");
    expect(body.message).toMatch(/row-level security/i);
  });

  it("rejects unauthenticated access outright", async () => {
    const res = await fetch(`${DATA_API_URL}/contacts?select=id`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
