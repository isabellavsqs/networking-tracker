// Integration test for the trusted database-level validation in db/schema.sql.
// Connects directly with DATABASE_URL (never used by the deployed app) as the
// table owner, so these assertions exercise the CHECK constraints themselves,
// not RLS. Each case runs inside a transaction that's always rolled back.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("contacts table validation", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  async function attemptInsert(overrides: Partial<{ name: string; priority: string }>) {
    await client.query("begin");
    try {
      await client.query(
        `insert into contacts (user_id, name, priority)
         values ('test-user', $1, $2)`,
        [overrides.name ?? "Ada Lovelace", overrides.priority ?? "medium"]
      );
    } finally {
      await client.query("rollback");
    }
  }

  it("rejects a blank name", async () => {
    await expect(attemptInsert({ name: "   " })).rejects.toThrow(
      /contacts_name_not_blank/
    );
  });

  it("rejects an invalid priority", async () => {
    await expect(attemptInsert({ priority: "urgent" })).rejects.toThrow(
      /contacts_priority_valid/
    );
  });

  it("accepts a valid contact", async () => {
    await expect(
      attemptInsert({ name: "Ada Lovelace", priority: "high" })
    ).resolves.not.toThrow();
  });
});
