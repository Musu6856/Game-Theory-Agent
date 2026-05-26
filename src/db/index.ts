import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let database: Database | null = null;

export function getDb() {
  if (!database) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not configured");
    }

    database = drizzle(neon(databaseUrl), { schema });
  }

  return database;
}
