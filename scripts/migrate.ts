// Applies db/schema.sql to the database at DATABASE_URL. Local/dev convenience only —
// never runs in the deployed app. Usage: npm run db:migrate
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import "dotenv/config";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Add it to .env.local first.");
    process.exit(1);
  }

  const sql = readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf-8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Schema applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
