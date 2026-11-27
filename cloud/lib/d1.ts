import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

type SqlValue = string | number | null;
type SqlRow = Record<string, unknown>;

declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

function binding(): D1Database {
  const { env: { DB: database } } = getCloudflareContext();
  if (!database) throw new Error("The Cloudflare D1 binding DB is unavailable.");
  return database;
}

export function db() {
  const database = binding();
  return {
    prepare(query: string) {
      const bind = (...values: SqlValue[]) => database.prepare(query).bind(...values);
      return {
        bind,
        get: async (...values: SqlValue[]) =>
          (await bind(...values).first<SqlRow>()) ?? undefined,
        all: async (...values: SqlValue[]) => (await bind(...values).all<SqlRow>()).results,
        run: async (...values: SqlValue[]) => (await bind(...values).run()).meta,
      };
    },
  };
}

export function batch(...statements: D1PreparedStatement[]) {
  return binding().batch(statements);
}
