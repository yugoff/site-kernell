import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Account, User, Service, Order, Activity } from "./catalog";

let database: DatabaseSync | undefined;
export function db() {
  if (database) return database;
  const filename =
    process.env.CLOUD_DATABASE_PATH ||
    path.join(process.cwd(), ".data", "cloud.sqlite");
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  database.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, price INTEGER NOT NULL,
      renewal TEXT NOT NULL, details TEXT NOT NULL, address TEXT NOT NULL, auto_renew INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, amount INTEGER NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL,
      request_key TEXT NOT NULL, UNIQUE(user_id, request_key)
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, created TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS services_user ON services(user_id);
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
  `);
  return database;
}

export function transaction<T>(run: () => T): T {
  const sql = db();
  sql.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    sql.exec("COMMIT");
    return result;
  } catch (error) {
    sql.exec("ROLLBACK");
    throw error;
  }
}

export function logActivity(userId: string, title: string) {
  db()
    .prepare("INSERT INTO activity (user_id,title,created) VALUES (?,?,?)")
    .run(userId, title, new Date().toISOString());
}

export function accountFor(user: User): Account {
  const sql = db();
  const services = sql
    .prepare(
      "SELECT id,kind,name,status,price,renewal,details,address,auto_renew AS autoRenew FROM services WHERE user_id=? ORDER BY kind DESC,name",
    )
    .all(user.id) as unknown as Service[];
  return {
    user,
    services: services.map((service) => ({
      ...service,
      autoRenew: Boolean(service.autoRenew),
    })),
    // node:sqlite returns null-prototype rows. RSC props require plain objects.
    orders: sql
      .prepare(
        "SELECT id,title,amount,created,status FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 100",
      )
      .all(user.id)
      .map((row) => ({ ...row })) as unknown as Order[],
    activity: sql
      .prepare(
        "SELECT id,title,created FROM activity WHERE user_id=? ORDER BY id DESC LIMIT 12",
      )
      .all(user.id)
      .map((row) => ({ ...row })) as unknown as Activity[],
    balance: user.demo ? 2480 : 0,
  };
}

export function createDemo(): User {
  const id = randomUUID();
  const now = Date.now();
  const inDays = (days: number) =>
    new Date(now + days * 86400000).toISOString();
  return transaction(() => {
    db()
      .prepare("DELETE FROM users WHERE demo=1 AND created<?")
      .run(now - 86400000);
    db()
      .prepare(
        "INSERT INTO users (id,name,email,password,demo,created) VALUES (?,?,?,?,1,?)",
      )
      .run(id, "Александр", `demo-${id}@example.invalid`, "", now);
    const insert = db().prepare(
      "INSERT INTO services (id,user_id,kind,name,status,price,renewal,details,address) VALUES (?,?,?,?,?,?,?,?,?)",
    );
    insert.run(
      randomUUID(),
      id,
      "vps",
      "production-01",
      "running",
      890,
      inDays(12),
      "2 vCPU · 4 ГБ RAM · 50 ГБ NVMe|Москва|Ubuntu 24.04",
      "192.0.2.14",
    );
    insert.run(
      randomUUID(),
      id,
      "vps",
      "dev-sandbox",
      "stopped",
      490,
      inDays(24),
      "1 vCPU · 2 ГБ RAM · 25 ГБ NVMe|Санкт-Петербург|Debian 12",
      "192.0.2.28",
    );
    insert.run(
      randomUUID(),
      id,
      "domain",
      "your-project.ru",
      "active",
      690,
      inDays(58),
      "ns1.example.invalid|ns2.example.invalid",
      "",
    );
    insert.run(
      randomUUID(),
      id,
      "domain",
      "your-studio.com",
      "active",
      2690,
      inDays(185),
      "ns1.example.invalid|ns2.example.invalid",
      "",
    );
    db()
      .prepare(
        "INSERT INTO orders (id,user_id,title,amount,created,status,request_key) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        id,
        "Сервер production-01 · Проект",
        890,
        new Date(now - 86400000 * 18).toISOString(),
        "demo",
        "seed",
      );
    logActivity(id, "Сервер production-01 запущен");
    logActivity(id, "Домен your-project.ru добавлен");
    return { id, name: "Александр", email: "demo@example.invalid", demo: true };
  });
}
