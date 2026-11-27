import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const cloudDirectory = fileURLToPath(new URL("../", import.meta.url));
const wrangler = fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url));

function wranglerEnv(directory) {
  return {
    ...process.env,
    WRANGLER_SEND_METRICS: "false",
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true",
    XDG_CONFIG_HOME: path.join(directory, ".config"),
    WRANGLER_LOG_PATH: path.join(directory, "wrangler.log"),
  };
}

async function startWorker(directory, port, variables) {
  const state = path.join(directory, "d1");
  const envFile = path.join(directory, "test.env");
  const env = wranglerEnv(directory);
  await writeFile(envFile, Object.entries(variables).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n"), { mode: 0o600 });
  await exec(process.execPath, [wrangler, "d1", "migrations", "apply", "DB", "--local", "--persist-to", state], {
    cwd: cloudDirectory,
    env,
  });
  return spawn(process.execPath, [
    wrangler, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
    "--persist-to", state, "--env-file", envFile, "--show-interactive-dev-session", "false", "--test-scheduled",
  ], {
    cwd: cloudDirectory,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

let child, directory, base, mailServer, yookassaServer;
const deliveredMails = [];
const yookassaPayments = new Map();
const yookassaCreateRequests = [];
let logs = "";
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "kernell-cloud-test-"));
  mailServer = createHttpServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        deliveredMails.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        // ignore invalid test payload
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => mailServer.listen(0, "127.0.0.1", resolve));
  const mailPort = mailServer.address().port;

  const expectedAuth = `Basic ${Buffer.from("test-shop:test-secret").toString("base64")}`;
  yookassaServer = createHttpServer((req, res) => {
    if (req.headers.authorization !== expectedAuth) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end('{"code":"unauthorized"}');
      return;
    }
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/payments") {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        yookassaCreateRequests.push({
          idempotenceKey: req.headers["idempotence-key"],
          payload,
        });
        const id = `yk-${yookassaPayments.size + 1}`;
        const payment = {
          id,
          status: "pending",
          paid: false,
          amount: payload.amount,
          confirmation: {
            type: "redirect",
            confirmation_url: `https://yoomoney.example.test/pay/${id}`,
          },
          metadata: payload.metadata,
          created_at: new Date().toISOString(),
        };
        yookassaPayments.set(id, payment);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payment));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/payments/")) {
        const id = decodeURIComponent(req.url.slice("/payments/".length));
        const payment = yookassaPayments.get(id);
        if (!payment) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end('{"code":"not_found"}');
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payment));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise((resolve) =>
    yookassaServer.listen(0, "127.0.0.1", resolve),
  );
  const ykPort = yookassaServer.address().port;

  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = await startWorker(directory, port, {
    CLOUD_ORIGIN: base,
    CLOUD_DEMO_ENABLED: "true",
    CLOUD_DATA_ENCRYPTION_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    MAILER_WEBHOOK_URL: `http://127.0.0.1:${mailPort}/mail`,
    YOOKASSA_SHOP_ID: "test-shop",
    YOOKASSA_SECRET_KEY: "test-secret",
    YOOKASSA_API_URL: `http://127.0.0.1:${ykPort}`,
    YOOKASSA_VERIFY_WEBHOOK_IP: "true",
    CLOUD_INTERNAL_SECRET: "test-internal-secret",
    TIMEWEB_TOKEN: "",
    CLOUD_SALES_ENABLED: "true",
  });
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1500) })).ok) return;
    } catch {
      /* wait for the owned server */
    }
    await delay(150);
  }
  throw new Error(`Server did not start: ${logs}`);
});
after(async () => {
  if (child && child.exitCode === null) {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([stopped, delay(4000)]);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await stopped;
    }
  }
  if (mailServer) {
    await new Promise((resolve) => mailServer.close(resolve));
  }
  if (yookassaServer) {
    await new Promise((resolve) => yookassaServer.close(resolve));
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

function client(endpoint = base) {
  let cookie = "";
  return {
    async request(route, body, options = {}) {
      const method = options.method ?? (body === undefined ? "GET" : "POST");
      const hasJsonBody = body !== undefined;
      const response = await fetch(endpoint + route, {
        method,
        redirect: "manual",
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(method !== "GET" ? { Origin: endpoint } : {}),
          ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
        body: hasJsonBody ? JSON.stringify(body) : undefined,
      });
      const session = response.headers
        .getSetCookie()
        .find((value) => value.startsWith("kernell_cloud_session="));
      if (session) cookie = session.split(";")[0];
      const type = response.headers.get("content-type") || "";
      const data = type.includes("application/json")
        ? await response.json()
        : await response.text();
      return { status: response.status, data, headers: response.headers };
    },
    get cookie() {
      return cookie;
    },
  };
}
const credentials = {
  name: "Тестовый пользователь",
  email: "account@example.test",
  password: "unique-long-password",
  consent: true,
};

test("domain search validates syntax and accepts full names beyond the retail catalog", async () => {
  const guest = client();
  const route = "/api/domains/check";
  assert.equal((await guest.request(route, { query: "foo..ru" })).status, 400);
  assert.equal((await guest.request(route, { query: "https://foo.ru/path" })).status, 400);
  for (const query of ["example.com", "пример.рф", "my-project.shop", "my-project.org.ru"]) {
    assert.equal((await guest.request(route, { query })).status, 503, query);
  }
});

test("public pages render and private data requires authentication", async () => {
  const guest = client();
  for (const route of [
    "/",
    "/vps",
    "/domains",
    "/login",
    "/register",
    "/privacy",
  ]) {
    const response = await guest.request(route);
    assert.equal(response.status, 200, route);
    assert.match(response.data, /Kernell|kernell/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal((await guest.request("/api/account")).status, 401);
  const privatePage = await guest.request("/dashboard");
  assert.equal(privatePage.status, 307);
  assert.equal(privatePage.headers.get("location"), "/login");
});

test("registration persists an isolated account, validates consent and protects session cookies", async () => {
  const user = client();
  assert.equal(
    (
      await user.request("/api/auth/register", {
        ...credentials,
        consent: false,
      })
    ).status,
    400,
  );
  const registration = await user.request("/api/auth/register", credentials);
  assert.equal(registration.status, 200);
  assert.match(registration.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(registration.headers.get("set-cookie"), /SameSite=lax/i);
  const account = await user.request("/api/account");
  assert.equal(account.data.user.demo, false);
  assert.equal(account.data.user.email, credentials.email);
  assert.deepEqual(account.data.services, []);
  assert.equal(account.data.balance, 0);
  assert.equal(account.data.user.password, undefined);
  assert.match(account.headers.get("cache-control"), /no-store/);
  assert.equal(
    (await user.request("/api/auth/register", credentials)).status,
    409,
  );
});

test("orders use server-side prices, remain unpaid drafts and are idempotent", async () => {
  const user = client();
  assert.equal(
    (await user.request("/api/auth/login", credentials)).status,
    200,
  );
  const order = {
    kind: "vps",
    plan: "project",
    name: "test-server",
    os: "Ubuntu 24.04",
    location: "Москва",
    amount: 1,
    requestKey: "order-test-idempotent",
  };
  const first = await user.request("/api/orders", order);
  assert.equal(first.status, 200);
  assert.equal(first.data.status, "draft");
  assert.equal(
    (await user.request("/api/orders", order)).data.id,
    first.data.id,
  );
  const account = (await user.request("/api/account")).data;
  assert.equal(account.orders.length, 1);
  assert.equal(account.orders[0].amount, 890);
  assert.equal(account.orders[0].status, "draft");
  assert.deepEqual(account.services, []);
  assert.equal(
    (
      await user.request("/api/orders", {
        ...order,
        plan: "made-up",
        requestKey: "order-test-invalid",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await user.request("/api/orders", {
        kind: "domain",
        name: "мой-проект.рф",
        requestKey: "domain-test-valid",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await user.request("/api/orders", {
        kind: "domain",
        name: "bad..ru",
        requestKey: "domain-test-invalid",
      })
    ).status,
    400,
  );

  // User can delete their own draft orders; foreign/cross-origin/re-deletes are rejected.
  const other = client();
  assert.equal((await other.request("/api/auth/demo", {})).status, 200);
  assert.equal(
    (
      await other.request(`/api/orders?id=${encodeURIComponent(first.data.id)}`, undefined, {
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}/api/orders?id=${encodeURIComponent(first.data.id)}`, {
        method: "DELETE",
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const deleted = await user.request(
    `/api/orders?id=${encodeURIComponent(first.data.id)}`,
    undefined,
    { method: "DELETE" },
  );
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deleted, true);
  assert.equal(
    (
      await user.request(`/api/orders?id=${encodeURIComponent(first.data.id)}`, undefined, {
        method: "DELETE",
      })
    ).status,
    404,
  );
  const afterDelete = (await user.request("/api/account")).data;
  assert.ok(!afterDelete.orders.some((o) => o.id === first.data.id));
});

test("demo services are isolated, ownership is checked, NS validation and controls work", async () => {
  const one = client(),
    two = client();
  assert.equal((await one.request("/api/auth/demo", {})).status, 200);
  assert.equal((await two.request("/api/auth/demo", {})).status, 200);
  const original = (await one.request("/api/account")).data;
  const other = (await two.request("/api/account")).data;
  assert.notEqual(original.user.id, other.user.id);
  assert.equal(original.services.length, 4);
  assert.equal(original.balance, 2480);
  const rendered = await one.request("/dashboard");
  assert.equal(rendered.status, 200);
  assert.match(rendered.data, /<h1>Привет,/);
  assert.doesNotMatch(rendered.data, /Only plain objects/);
  const server = original.services.find(
    (service) => service.kind === "vps" && service.status === "running",
  );
  assert.equal(
    (await two.request(`/api/services/${server.id}`, { action: "stop" }))
      .status,
    404,
  );
  assert.equal(
    (await one.request(`/api/services/${server.id}`, { action: "stop" }))
      .status,
    200,
  );
  assert.equal(
    (await one.request("/api/account")).data.services.find(
      (service) => service.id === server.id,
    ).status,
    "stopped",
  );
  assert.equal(
    (await one.request(`/api/services/${server.id}`, { action: "restart" }))
      .status,
    400,
  );
  assert.equal(
    (await one.request(`/api/services/${server.id}`, { action: "start" }))
      .status,
    200,
  );
  assert.equal(
    (
      await one.request(`/api/services/${server.id}`, {
        action: "renewal",
        enabled: false,
      })
    ).status,
    200,
  );
  const domain = original.services.find((service) => service.kind === "domain");
  assert.equal(
    (
      await one.request(`/api/services/${domain.id}`, {
        action: "dns",
        nameservers: ["bad", "ns2.example.com"],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await one.request(`/api/services/${domain.id}`, {
        action: "dns",
        nameservers: ["ns1.example.com", "ns2.example.com"],
      })
    ).status,
    200,
  );
  assert.equal(
    (await one.request("/api/account")).data.services.find(
      (service) => service.id === domain.id,
    ).details,
    "ns1.example.com|ns2.example.com",
  );
  assert.equal(
    (await two.request("/api/account")).data.services.find(
      (service) => service.kind === "domain",
    ).details,
    "ns1.example.invalid|ns2.example.invalid",
  );
});

test("cross-origin mutations and invalid JSON are rejected", async () => {
  const user = client();
  assert.equal(
    (
      await user.request("/api/auth/login", credentials, {
        headers: { Origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  assert.equal((await user.request("/api/auth/login", [], {})).status, 400);
  assert.equal(
    (
      await user.request("/api/auth/login", {
        ...credentials,
        password: "incorrect",
      })
    ).status,
    401,
  );
});

test("password change revokes other sessions; logout revokes the current session", async () => {
  const one = client(),
    two = client();
  assert.equal((await one.request("/api/auth/login", credentials)).status, 200);
  assert.equal((await two.request("/api/auth/login", credentials)).status, 200);
  const password = "another-long-and-unique-password";
  assert.equal(
    (
      await one.request("/api/profile", {
        name: "Новое имя",
        currentPassword: credentials.password,
        newPassword: password,
      })
    ).status,
    200,
  );
  assert.equal((await two.request("/api/account")).status, 401);
  assert.equal((await one.request("/api/account")).data.user.name, "Новое имя");
  assert.equal((await two.request("/api/auth/login", credentials)).status, 401);
  assert.equal(
    (await two.request("/api/auth/login", { ...credentials, password })).status,
    200,
  );
  assert.equal((await one.request("/api/auth/logout", {})).status, 200);
  assert.equal((await one.request("/api/account")).status, 401);
  assert.equal((await two.request("/api/account")).status, 200);
});

test("catalog endpoint exposes fallback categories and validates category parameter", async () => {
  const guest = client();
  const vps = await guest.request("/api/catalog?category=vps");
  assert.equal(vps.status, 200);
  assert.equal(vps.data.source, "fallback");
  assert.equal(vps.data.presets.length, 4);

  const domains = await guest.request("/api/catalog?category=domains");
  assert.equal(domains.status, 200);
  assert.equal(domains.data.zones.length, 4);

  const all = await guest.request("/api/catalog?category=all");
  assert.equal(all.status, 200);
  assert.ok(all.data.catalogs.databases);
  assert.ok(all.data.catalogs.ai);

  assert.equal((await guest.request("/api/catalog?category=unknown")).status, 400);
});

test("email verification, password recovery and encrypted domain person profiles work", async () => {
  const guest = client();
  for (const route of ["/reset-password", "/verify-email"]) {
    assert.equal((await guest.request(route)).status, 200, route);
  }

  const email = "verify-reset@example.test";
  const initialPassword = "initial-long-password";
  const regUser = client();
  assert.equal(
    (
      await regUser.request("/api/auth/register", {
        name: "Пётр",
        email,
        password: initialPassword,
        consent: true,
      })
    ).status,
    200,
  );

  // Give the best-effort registration verification mail a moment to hit local mailServer.
  await delay(100);
  const verifyMail = deliveredMails.find(
    (m) => m.to === email && m.subject.includes("Подтвердите email"),
  );
  assert.ok(verifyMail, "Verification email should be dispatched on registration");
  const verifyToken = verifyMail.text.match(/token=([0-9a-f]{64})/)?.[1];
  assert.ok(verifyToken);

  assert.equal(
    (await regUser.request("/api/account")).data.user.emailVerified,
    false,
  );
  assert.equal(
    (
      await regUser.request("/api/auth/verify-email", { token: verifyToken })
    ).status,
    200,
  );
  assert.equal(
    (await regUser.request("/api/account")).data.user.emailVerified,
    true,
  );
  // Single-use token cannot be replayed.
  assert.equal(
    (
      await regUser.request("/api/auth/verify-email", { token: verifyToken })
    ).status,
    400,
  );

  // Create and isolate encrypted domain person profile.
  const createdPerson = await regUser.request("/api/persons", {
    type: "person",
    name: "Петров Пётр Петрович",
    isResident: true,
    birthdate: "1991-05-14",
    passportSeries: "4512",
    passportNumber: "987654",
    passportDate: "2012-06-20",
    passportPlace: "УФМС России",
    postcode: "101000",
    mailingAddress: "г. Москва, ул. Пушкина, д. 1",
    phone: "+79001112233",
    email,
  });
  assert.equal(createdPerson.status, 200);
  assert.doesNotMatch(createdPerson.data.person.summary, /987654/);
  assert.match(createdPerson.data.person.summary, /45\*\* ••7654/);

  const personsList = await regUser.request("/api/persons");
  assert.equal(personsList.status, 200);
  assert.equal(personsList.data.persons.length, 1);

  const otherClient = client();
  assert.equal((await otherClient.request("/api/auth/demo", {})).status, 200);
  assert.equal(
    (
      await otherClient.request("/api/persons", { type: "person" })
    ).status,
    400,
  );
  assert.equal(
    (
      await regUser.request(
        `/api/persons?id=${encodeURIComponent(createdPerson.data.person.id)}`,
        undefined,
        { method: "DELETE" },
      )
    ).status,
    200,
  );
  assert.equal((await regUser.request("/api/persons")).data.persons.length, 0);

  // Password recovery flow invalidates previous sessions.
  assert.equal(
    (await guest.request("/api/auth/forgot-password", { email })).status,
    200,
  );
  await delay(100);
  const resetMail = deliveredMails.find(
    (m) => m.to === email && m.subject.includes("Восстановление пароля"),
  );
  assert.ok(resetMail, "Password reset email should be dispatched");
  const resetToken = resetMail.text.match(/token=([0-9a-f]{64})/)?.[1];
  assert.ok(resetToken);

  const newPassword = "recovered-long-password";
  assert.equal(
    (
      await guest.request("/api/auth/reset-password", {
        token: resetToken,
        password: newPassword,
      })
    ).status,
    200,
  );
  // Previous session must be revoked.
  assert.equal((await regUser.request("/api/account")).status, 401);
  // Old password rejected, new password accepted.
  assert.equal(
    (
      await guest.request("/api/auth/login", {
        email,
        password: initialPassword,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await guest.request("/api/auth/login", {
        email,
        password: newPassword,
      })
    ).status,
    200,
  );
});

test("yookassa topup with 54-FZ receipt, webhook verification, ledger and order payment work", async () => {
  const unverified = client();
  const unverifiedEmail = "unverified-payer@example.test";
  assert.equal(
    (
      await unverified.request("/api/auth/register", {
        name: "Иван",
        email: unverifiedEmail,
        password: "long-secure-password",
        consent: true,
      })
    ).status,
    200,
  );
  // Unverified email cannot initiate YooKassa topup.
  assert.equal(
    (
      await unverified.request("/api/billing/topup", {
        amountRub: 1000,
        requestKey: "topup-unverified-1",
      })
    ).status,
    403,
  );

  // Verify email via delivered mail token.
  await delay(100);
  const mail = deliveredMails.find((m) => m.to === unverifiedEmail);
  const token = mail?.text.match(/token=([0-9a-f]{64})/)?.[1];
  assert.ok(token);
  assert.equal(
    (await unverified.request("/api/auth/verify-email", { token })).status,
    200,
  );

  // Initiate YooKassa topup (1000 RUB) + test idempotency.
  const topup = await unverified.request("/api/billing/topup", {
    amountRub: 1000,
    requestKey: "topup-idempotent-1",
  });
  assert.equal(topup.status, 200);
  assert.match(topup.data.confirmationUrl, /^https:\/\/yoomoney\.example\.test\/pay\//);
  const externalId = topup.data.externalId;
  assert.ok(externalId);

  const duplicateTopup = await unverified.request("/api/billing/topup", {
    amountRub: 1000,
    requestKey: "topup-idempotent-1",
  });
  assert.equal(duplicateTopup.status, 200);
  assert.equal(duplicateTopup.data.paymentId, topup.data.paymentId);
  assert.equal(yookassaCreateRequests.length, 1);
  assert.equal(
    yookassaCreateRequests[0].payload.receipt.customer.email,
    unverifiedEmail,
  );
  assert.equal(
    yookassaCreateRequests[0].payload.receipt.items[0].amount.value,
    "1000.00",
  );

  // Untrusted IP webhook is rejected.
  const untrustedWebhook = await fetch(`${base}/api/webhooks/yookassa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": "203.0.113.10",
      "x-real-ip": "127.0.0.1",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify({
      type: "notification",
      event: "payment.succeeded",
      object: { id: externalId },
    }),
  });
  assert.equal(untrustedWebhook.status, 403);

  // Spoofed webhook before payment actually succeeded at YooKassa must NOT credit balance.
  const prematureWebhook = await fetch(`${base}/api/webhooks/yookassa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": "127.0.0.1",
    },
    body: JSON.stringify({
      type: "notification",
      event: "payment.succeeded",
      object: { id: externalId },
    }),
  });
  assert.equal(prematureWebhook.status, 200);
  assert.equal((await unverified.request("/api/account")).data.balance, 0);

  // Mark payment succeeded on YooKassa mock, then deliver webhook + duplicate sync.
  const stored = yookassaPayments.get(externalId);
  stored.status = "succeeded";
  stored.paid = true;

  const sendWebhook = () => fetch(`${base}/api/webhooks/yookassa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": "127.0.0.1",
    },
    body: JSON.stringify({
      type: "notification",
      event: "payment.succeeded",
      object: { id: externalId },
    }),
  });
  const webhooks = await Promise.all([sendWebhook(), sendWebhook()]);
  assert.deepEqual(webhooks.map((response) => response.status), [200, 200]);

  // Duplicate sync must be strictly idempotent (balance stays 1000, not 2000).
  const manualSync = await unverified.request(
    `/api/billing/payments/${encodeURIComponent(topup.data.paymentId)}/sync`,
    {},
  );
  assert.equal(manualSync.status, 200);
  assert.equal(manualSync.data.status, "succeeded");
  const afterTopup = (await unverified.request("/api/account")).data;
  assert.equal(afterTopup.balance, 1000);
  assert.equal(afterTopup.ledger.length, 1);
  assert.equal(afterTopup.yookassaEnabled, true);

  // Create VPS draft order (890 RUB) and pay from wallet.
  const order1 = await unverified.request("/api/orders", {
    kind: "vps",
    plan: "project",
    name: "prod-node-1",
    os: "Ubuntu 24.04",
    location: "Москва",
    requestKey: "paid-vps-order-1",
  });
  assert.equal(order1.status, 200);
  const order2 = await unverified.request("/api/orders", {
    kind: "vps",
    plan: "project",
    name: "prod-node-2",
    os: "Ubuntu 24.04",
    location: "Москва",
    requestKey: "paid-vps-order-2",
  });
  assert.equal(order2.status, 200);
  const orders = [order1, order2];
  const payments = await Promise.all(orders.map((order) =>
    unverified.request(`/api/orders/${order.data.id}/pay`, {}),
  ));
  assert.deepEqual(payments.map((payment) => payment.status).sort(), [200, 402]);
  const winner = payments.findIndex((payment) => payment.status === 200);
  assert.equal(payments[winner].data.status, "paid");
  assert.equal(payments[winner].data.balanceRub, 110);

  const paidId = orders[winner].data.id;
  const duplicate = await unverified.request(`/api/orders/${paidId}/pay`, {});
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.alreadyPaid, true);
  assert.equal(duplicate.data.balanceRub, 110);
  const balance = (await unverified.request("/api/account")).data;
  assert.equal(balance.balance, 110);
  assert.equal(balance.ledger.filter((entry) => entry.direction === "debit").length, 1);

  assert.equal(
    (await unverified.request(`/api/orders?id=${paidId}`, undefined, { method: "DELETE" })).status,
    409,
  );

  // Internal billing tick endpoint rejects unauthorized calls and executes with secret.
  assert.equal(
    (await fetch(`${base}/api/internal/billing`, { method: "POST" })).status,
    401,
  );
  const tickRes = await fetch(`${base}/api/internal/billing`, {
    method: "POST",
    headers: { Authorization: "Bearer test-internal-secret" },
  });
  assert.equal(tickRes.status, 200);
  const tickJson = await tickRes.json();
  assert.equal(tickJson.ok, true);
  assert.deepEqual(tickJson.tick, {
    renewed: 0,
    suspended: 0,
    terminationQueued: 0,
  });
  const cron = await fetch(`${base}/__scheduled?cron=${encodeURIComponent("*/5 * * * *")}`);
  assert.equal(cron.status, 200, await cron.text());

  // Make the paid test subscription due in the same temporary D1 used by workerd.
  assert.match(paidId, /^[0-9a-f-]{36}$/);
  const due = Date.now() - 1000;
  await exec(process.execPath, [
    wrangler, "d1", "execute", "DB", "--local", "--persist-to", path.join(directory, "d1"),
    "--command", `UPDATE subscriptions SET next_charge_at=${due},retail_kopecks=5000 WHERE order_id='${paidId}'`,
  ], { cwd: cloudDirectory, env: wranglerEnv(directory) });
  const maintenance = () => fetch(`${base}/api/internal/billing`, {
    method: "POST",
    headers: { Authorization: "Bearer test-internal-secret" },
  });
  const ticks = await Promise.all([maintenance(), maintenance()]);
  assert.deepEqual(ticks.map((response) => response.status), [200, 200]);
  const renewed = (await unverified.request("/api/account")).data;
  assert.equal(renewed.balance, 60);
  assert.equal(renewed.ledger.filter((entry) => entry.kind === "renewal_charge").length, 1);
});

test("default Worker keeps payments disabled even with provider credentials", async () => {
  const state = await mkdtemp(path.join(tmpdir(), "kernell-cloud-readonly-"));
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const endpoint = `http://127.0.0.1:${port}`;
  const origin = "https://preview.example.test";
  const email = "read-only@example.test";
  const beforePayments = yookassaCreateRequests.length;
  const worker = await startWorker(state, port, {
    CLOUD_ORIGIN: origin,
    MAILER_WEBHOOK_URL: `http://127.0.0.1:${mailServer.address().port}/mail`,
    YOOKASSA_SHOP_ID: "test-shop",
    YOOKASSA_SECRET_KEY: "test-secret",
    YOOKASSA_API_URL: `http://127.0.0.1:${yookassaServer.address().port}`,
    TIMEWEB_TOKEN: "",
    CLOUD_INTERNAL_SECRET: "test-internal-secret",
  });
  let output = "";
  worker.stdout.on("data", (data) => { output += data; });
  worker.stderr.on("data", (data) => { output += data; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100 && worker.exitCode === null; attempt++) {
      ready = await fetch(endpoint, { signal: AbortSignal.timeout(1500) })
        .then((response) => response.ok)
        .catch(() => false);
      if (ready) break;
      await delay(150);
    }
    assert.ok(ready, output);
    const guest = client(endpoint);
    const request = (route, body) => guest.request(route, body, { headers: { Origin: origin } });
    const account = await request("/api/auth/register", { ...credentials, email });
    assert.equal(account.status, 200);
    assert.match(account.headers.get("set-cookie"), /;\s*Secure(?:;|$)/i);
    const token = deliveredMails.find((message) => message.to === email)?.text.match(/token=([0-9a-f]{64})/)?.[1];
    assert.ok(token);
    assert.equal((await request("/api/auth/verify-email", { token })).status, 200);
    const topup = await request("/api/billing/topup", { amountRub: 1000, requestKey: "read-only-topup" });
    assert.equal(topup.status, 503);
    const draft = await request("/api/orders", {
      kind: "vps",
      name: "preview-server",
      plan: "project",
      os: "Ubuntu 24.04",
      location: "Москва",
      requestKey: "read-only-order",
    });
    assert.equal(draft.status, 200);
    assert.equal((await request(`/api/orders/${draft.data.id}/pay`, {})).status, 503);
    assert.equal((await guest.request("/api/account")).data.yookassaEnabled, false);
    assert.equal(yookassaCreateRequests.length, beforePayments);
    const cron = await fetch(`${endpoint}/__scheduled?cron=${encodeURIComponent("*/5 * * * *")}`);
    assert.equal(cron.status, 200, await cron.text());
  } finally {
    if (worker.exitCode === null) {
      const stopped = new Promise((resolve) => worker.once("exit", resolve));
      worker.kill("SIGTERM");
      await stopped;
    }
    await rm(state, { recursive: true, force: true });
  }
});

describe("phase 3 & 4: live Timeweb provisioning, infra, domain mail and isolation", () => {
  let twChild, twDir, twBase, twMailServer, twYkServer, twApiServer;
  const twMails = [];
  const twYkPayments = new Map();
  const twState = {
    projects: [],
    persons: [],
    sshKeys: [],
    servers: new Map(),
    domainRequests: new Map(),
    domains: new Map(),
    dnsRecords: new Map(),
    databases: new Map(),
    buckets: new Map(),
    k8s: new Map(),
    balancers: new Map(),
    firewallGroups: new Map(),
    vpcs: new Map(),
    floatingIps: new Map(),
    routers: new Map(),
    networkDrives: new Map(),
    cdnResources: new Map(),
    mailboxes: new Map(),
    takenDomains: new Set(["taken-domain.ru"]),
    nextId: 1000,
    calls: [],
  };

  before(async () => {
    twDir = await mkdtemp(path.join(tmpdir(), "kernell-cloud-phase3-"));
    twMailServer = createHttpServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          twMails.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          // ignore
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });
    });
    await new Promise((resolve) => twMailServer.listen(0, "127.0.0.1", resolve));
    const twMailPort = twMailServer.address().port;

    const expectedYkAuth = `Basic ${Buffer.from("test-shop:test-secret").toString("base64")}`;
    twYkServer = createHttpServer((req, res) => {
      if (req.headers.authorization !== expectedYkAuth) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end('{"code":"unauthorized"}');
        return;
      }
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        if (req.method === "POST" && req.url === "/payments") {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const id = `yk-live-${twYkPayments.size + 1}`;
          const payment = {
            id,
            status: "succeeded",
            paid: true,
            amount: payload.amount,
            confirmation: {
              type: "redirect",
              confirmation_url: `https://yoomoney.example.test/pay/${id}`,
            },
            metadata: payload.metadata,
            created_at: new Date().toISOString(),
          };
          twYkPayments.set(id, payment);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payment));
          return;
        }
        if (req.method === "GET" && req.url?.startsWith("/payments/")) {
          const id = decodeURIComponent(req.url.slice("/payments/".length));
          const p = twYkPayments.get(id);
          res.writeHead(p ? 200 : 404, { "Content-Type": "application/json" });
          res.end(JSON.stringify(p || { code: "not_found" }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });
    await new Promise((resolve) => twYkServer.listen(0, "127.0.0.1", resolve));
    const twYkPort = twYkServer.address().port;

    twApiServer = createHttpServer((req, res) => {
      if (req.headers.authorization !== "Bearer test-tw-token") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end('{"error_code":"unauthorized","message":"Bad token"}');
        return;
      }
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = raw ? JSON.parse(raw) : {};
        const urlObj = new URL(req.url, "http://127.0.0.1");
        const pathname = urlObj.pathname;
        twState.calls.push({ method: req.method, pathname, body });

        const ok = (payload, status = 200) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ response_id: "00000000-0000-4000-8000-000000000001", ...payload }));
        };

        if (req.method === "GET" && pathname === "/api/v1/tlds") {
          return ok({
            top_level_domains: [
              { id: 1, name: "ru", price: 179, prolong_price: 899, transfer: 0, is_published: true, is_whois_privacy_enabled: false },
              { id: 2, name: "xn--p1ai", price: 179, prolong_price: 899, transfer: 0, is_published: true, is_whois_privacy_enabled: false },
              {
                id: 3,
                name: "shop",
                price: 299,
                prolong_price: 2990,
                transfer: 299,
                whois_privacy_price: 150,
                is_published: true,
                is_whois_privacy_enabled: true,
                allowed_buy_periods: [
                  { period: "P1Y", price: 299 },
                  { period: "P2Y", price: 598 },
                ],
              },
              { id: 4, name: "tw1.ru", price: 0, prolong_price: 0, transfer: 0, is_published: true, is_whois_privacy_enabled: false },
            ],
          });
        }
        if (req.method === "GET" && pathname.startsWith("/api/v1/check-domain/")) {
          const fqdn = decodeURIComponent(pathname.slice("/api/v1/check-domain/".length));
          return ok({ is_domain_available: !twState.takenDomains.has(fqdn) });
        }
        if (req.method === "GET" && pathname === "/api/v2/locations") {
          return ok({
            locations: [
              { location: "ru-1", location_code: "RU", availability_zones: ["msk-1"] },
              { location: "nl-1", location_code: "NL", availability_zones: ["ams-1"] },
            ],
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/presets/servers") {
          return ok({
            server_presets: [
              {
                id: 101,
                location: "ru-1",
                price: 500,
                cpu: 2,
                cpu_frequency: "3.3 GHz",
                ram: 4096,
                disk: 51200,
                disk_type: "nvme",
                bandwidth: 200,
                description: "NVMe RU",
                description_short: "Cloud 2x4",
              },
              {
                id: 102,
                location: "nl-1",
                price: 400,
                cpu: 1,
                cpu_frequency: "3.3 GHz",
                ram: 2048,
                disk: 25600,
                disk_type: "nvme",
                bandwidth: 200,
                description: "NVMe NL",
                description_short: "Cloud NL",
              },
            ],
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/os/servers") {
          return ok({
            servers_os: [
              { id: 79, family: "linux", name: "ubuntu", version: "24.04" },
              { id: 80, family: "linux", name: "debian", version: "12" },
            ],
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/configurator/servers") {
          return ok({ server_configurators: [] });
        }
        if (req.method === "GET" && pathname === "/api/v1/software/servers") {
          return ok({ servers_software: [] });
        }
        if (req.method === "GET" && pathname === "/api/v1/account/finances") {
          return ok({
            finances: {
              balance: 50000,
              currency: "RUB",
              discount_end_date_at: null,
              discount_percent: 10,
              hourly_cost: 5,
              hourly_fee: 5,
              monthly_cost: 3600,
              monthly_fee: 3600,
              total_paid: 50000,
              hours_left: 1000,
              autopay_card_info: null,
            },
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/account/status") {
          return ok({
            status: {
              login: "reseller-test",
              is_blocked: false,
              is_permanent_blocked: false,
              is_send_bill_letters: false,
              company_info: { id: 1, name: "Kernell" },
              last_password_changed_at: "2026-01-01T00:00:00Z",
              ym_client_id: null,
            },
          });
        }
        if (req.method === "POST" && pathname === "/api/v1/projects") {
          const project = {
            id: 9001 + twState.projects.length,
            account_id: "acc-1",
            avatar_id: "1",
            description: body.description || "",
            name: body.name,
            is_default: false,
          };
          twState.projects.push(project);
          return ok({ project }, 201);
        }
        if (req.method === "POST" && pathname === "/api/v1/ssh-keys") {
          const key = {
            id: 301 + twState.sshKeys.length,
            name: body.name,
            body: body.body,
            created_at: new Date().toISOString(),
            is_default: Boolean(body.is_default),
            used_by: [],
          };
          twState.sshKeys.push(key);
          return ok({ "ssh-key": key }, 201);
        }
        if (req.method === "DELETE" && pathname.startsWith("/api/v1/ssh-keys/")) {
          const keyId = Number(pathname.slice("/api/v1/ssh-keys/".length));
          const idx = twState.sshKeys.findIndex((k) => k.id === keyId);
          if (idx >= 0) twState.sshKeys.splice(idx, 1);
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === "POST" && pathname === "/api/v1/persons") {
          const person = { id: 701 + twState.persons.length, ...body };
          twState.persons.push(person);
          return ok({ person }, 201);
        }
        if (req.method === "PUT" && pathname.startsWith("/api/v1/persons/")) {
          const id = Number(pathname.slice("/api/v1/persons/".length));
          const found = twState.persons.find((p) => p.id === id);
          if (!found) return ok({ message: "Not found" }, 404);
          Object.assign(found, body, { mailing_address: body.address });
          return ok({ person: found });
        }
        if (req.method === "POST" && pathname === "/api/v1/servers") {
          const id = 5001 + twState.servers.size;
          const server = {
            id,
            name: body.name,
            comment: body.comment || "",
            created_at: new Date().toISOString(),
            os: { id: body.os_id || 79, name: "ubuntu", version: "24.04" },
            software: null,
            preset_id: body.preset_id || 101,
            configurator_id: null,
            location: "ru-1",
            boot_mode: "std",
            status: "installing",
            start_at: null,
            is_ddos_guard: Boolean(body.is_ddos_guard),
            cpu: 2,
            ram: 4096,
            disks: [
              { id: 1, size: 51200, used: 2048, type: "nvme", is_mounted: true, is_system: true, system_name: "vda", status: "done" },
            ],
            vnc_pass: "VncPass!42",
            root_pass: "InitialRootPass!9",
            networks: [
              { type: "public", ips: [{ type: "ipv4", ip: "198.51.100.55", is_main: true }] },
            ],
            availability_zone: "msk-1",
          };
          twState.servers.set(id, server);
          return ok({ server }, 201);
        }
        const serverMatch = /^\/api\/v1\/servers\/(\d+)(?:\/(.*))?$/.exec(pathname);
        if (serverMatch) {
          const id = Number(serverMatch[1]);
          const sub = serverMatch[2] || "";
          const server = twState.servers.get(id);
          if (!server) return ok({ error_code: "not_found", message: "Not found" }, 404);
          if (!sub && req.method === "GET") return ok({ server });
          if (!sub && req.method === "PATCH") {
            if (body.os_id) {
              server.os = { id: body.os_id, name: body.os_id === 80 ? "debian" : "ubuntu", version: body.os_id === 80 ? "12" : "24.04" };
              server.status = "reinstalling";
            }
            return ok({ server });
          }
          if (!sub && req.method === "DELETE") {
            twState.servers.delete(id);
            return ok({ server_delete: { is_moved_in_quarantine: false } });
          }
          if (sub === "action" && req.method === "POST") {
            if (body.action === "start") server.status = "on";
            if (body.action === "shutdown" || body.action === "hard_shutdown") server.status = "off";
            if (body.action === "reboot" || body.action === "hard_reboot") server.status = "on";
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "reset-password" && req.method === "POST") {
            server.root_pass = "RotatedRootPass!2";
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "disks" && req.method === "GET") {
            return ok({ server_disks: server.disks });
          }
          if (sub === "disks" && req.method === "POST") {
            const disk = {
              id: server.disks.length + 1,
              size: body.size,
              used: 0,
              type: "nvme",
              is_mounted: true,
              is_system: false,
              system_name: `vd${String.fromCharCode(97 + server.disks.length)}`,
              status: "done",
            };
            server.disks.push(disk);
            return ok({ server_disk: disk }, 201);
          }
          if (sub === "ips" && req.method === "GET") {
            return ok({ server_ips: server.networks[0]?.ips || [] });
          }
        }
        if (req.method === "POST" && pathname === "/api/v1/domains-requests") {
          const reqId = ++twState.nextId;
          const record = {
            id: reqId,
            fqdn: body.fqdn,
            type: body.action === "register" ? "request" : body.action,
            period: body.period || "P1Y",
            person_id: body.person_id ?? null,
            money_source: null,
            is_autoprolong_enabled: body.is_autoprolong_enabled ?? true,
            is_whois_privacy_enabled: Boolean(body.is_whois_privacy_enabled),
            message: null,
          };
          twState.domainRequests.set(reqId, record);
          return ok({ request: record }, 201);
        }
        const domReqMatch = /^\/api\/v1\/domains-requests\/(\d+)$/.exec(pathname);
        if (domReqMatch) {
          const reqId = Number(domReqMatch[1]);
          const record = twState.domainRequests.get(reqId);
          if (!record) return ok({ message: "Not found" }, 404);
          if (req.method === "GET") return ok({ request: record });
          if (req.method === "PATCH") {
            record.money_source = body.money_source;
            twState.domains.set(record.fqdn, {
              id: twState.nextId++,
              fqdn: record.fqdn,
              domain_status: "paid",
              request_status: null,
              expiration: new Date(Date.now() + 730 * 86400000).toISOString(),
              paid_till: new Date(Date.now() + 730 * 86400000).toISOString(),
              days_left: 730,
              is_autoprolong_enabled: true,
              is_prolong_allowed: true,
              is_whois_privacy_enabled: record.is_whois_privacy_enabled,
              person_id: record.person_id,
              subdomains: [],
              nameservers: ["ns1.timeweb.ru", "ns2.timeweb.ru"],
            });
            twState.takenDomains.add(record.fqdn);
            return ok({ request: record });
          }
        }
        const dnsV2Match = /^\/api\/v2\/domains\/([^/]+)\/dns-records(?:\/(\d+))?$/.exec(pathname);
        if (dnsV2Match) {
          const targetFqdn = decodeURIComponent(dnsV2Match[1]);
          const rootFqdn = targetFqdn.split(".").slice(-2).join(".");
          const list = twState.dnsRecords.get(rootFqdn) || [];
          if (req.method === "GET" && !dnsV2Match[2]) {
            return ok({ meta: { total: list.length }, dns_records: list });
          }
          if (req.method === "POST" && !dnsV2Match[2]) {
            const subLabel = targetFqdn === rootFqdn ? undefined : targetFqdn.slice(0, -(rootFqdn.length + 1));
            const rec = {
              id: ++twState.nextId,
              type: body.type,
              fqdn: rootFqdn,
              ttl: body.ttl || 600,
              data: {
                ...(subLabel ? { subdomain: subLabel } : {}),
                ...(body.value !== undefined ? { value: body.value } : {}),
                ...(body.priority !== undefined ? { priority: body.priority } : {}),
                ...(body.host !== undefined ? { host: body.host } : {}),
                ...(body.port !== undefined ? { port: body.port } : {}),
                ...(body.service !== undefined ? { service: body.service } : {}),
                ...(body.protocol !== undefined ? { protocol: body.protocol } : {}),
              },
            };
            list.push(rec);
            twState.dnsRecords.set(rootFqdn, list);
            return ok({ dns_record: rec }, 201);
          }
          if (req.method === "DELETE" && dnsV2Match[2]) {
            const recId = Number(dnsV2Match[2]);
            twState.dnsRecords.set(rootFqdn, list.filter((r) => r.id !== recId));
            res.writeHead(204);
            res.end();
            return;
          }
        }
        const subMatch = /^\/api\/v1\/domains\/([^/]+)\/subdomains\/([^/]+)$/.exec(pathname);
        if (subMatch && req.method === "POST") {
          const rootFqdn = decodeURIComponent(subMatch[1]);
          const subLabel = decodeURIComponent(subMatch[2]);
          const dom = twState.domains.get(rootFqdn);
          if (dom) {
            dom.subdomains.push({ id: ++twState.nextId, fqdn: `${subLabel}.${rootFqdn}` });
          }
          return ok({ subdomain: { id: twState.nextId, fqdn: `${subLabel}.${rootFqdn}` } }, 201);
        }
        const nsMatch = /^\/api\/v1\/domains\/([^/]+)\/name-servers$/.exec(pathname);
        if (nsMatch) {
          const fqdn = decodeURIComponent(nsMatch[1]);
          const dom = twState.domains.get(fqdn);
          if (!dom) return ok({ message: "Not found" }, 404);
          if (req.method === "PUT") {
            dom.nameservers = (body.name_servers || []).map((i) => i.host);
          }
          return ok({
            meta: { total: 1 },
            name_servers: [
              {
                is_delegation_allowed: true,
                task_status: "done",
                items: dom.nameservers.map((host) => ({ host, ips: [] })),
              },
            ],
          });
        }
        const domMatch = /^\/api\/v1\/domains\/([^/]+)$/.exec(pathname);
        if (domMatch) {
          const fqdn = decodeURIComponent(domMatch[1]);
          const dom = twState.domains.get(fqdn);
          if (!dom) return ok({ message: "Not found" }, 404);
          if (req.method === "GET") return ok({ domain: dom });
          if (req.method === "PATCH") {
            if (typeof body.is_autoprolong_enabled === "boolean") {
              dom.is_autoprolong_enabled = body.is_autoprolong_enabled;
            }
            return ok({ domain: dom });
          }
        }

        // === Phase 4 catalogs ===
        if (req.method === "GET" && pathname === "/api/v1/database-types") {
          return ok({
            types: [{ name: "PostgreSQL", version: "16", type: "postgres16" }],
          });
        }
        if (req.method === "GET" && pathname === "/api/v2/presets/dbs") {
          return ok({
            databases_presets: [
              { id: 201, type: "postgres16", price: 1000, cpu: 2, ram: 4096, disk: 30720, location: "ru-1", description: "DB 2x4", description_short: "DB Start" },
            ],
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/configurator/databases") {
          return ok({ database_configurators: [] });
        }
        if (req.method === "GET" && pathname === "/api/v1/presets/storages") {
          return ok({
            storages_presets: [
              { id: 301, price: 200, disk: 102400, location: "ru-1", storage_class: "hot", description: "S3 100GB", description_short: "S3 100" },
            ],
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/presets/k8s") {
          return ok({
            k8s_presets: [
              { id: 401, price: 800, cpu: 2, ram: 4096, disk: 30720, type: "master", description: "K8s M", description_short: "K8s" },
            ],
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/k8s/k8s-versions") {
          return ok({ k8s_versions: ["1.30"] });
        }
        if (req.method === "GET" && pathname === "/api/v1/k8s/network-drivers") {
          return ok({ network_drivers: ["cilium"] });
        }
        if (req.method === "GET" && pathname === "/api/v1/presets/balancers") {
          return ok({
            balancers_presets: [
              { id: 501, price: 450, bandwidth: 100, replica_count: 2, request_per_second: 1000, location: "ru-1", description: "LB", description_short: "LB" },
            ],
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/cdn/presets") {
          return ok({
            http_resource_presets: [
              { id: 601, cost: 300, description: "CDN", description_short: "CDN" },
            ],
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/presets/routers") {
          return ok({
            router_presets: [
              { id: 701, cost: 250, node_count: 1, cpu: 1, cpu_frequency: "3.3", ram: 1024, bandwidth: 100, location: "ru-1" },
            ],
          });
        }
        if (req.method === "GET" && pathname === "/api/v1/presets/network-drives") {
          return ok({
            network_drive_presets: [
              { id: 801, cost_per_gb: 10, min: 10, max: 1000, step: 10, type: "nvme" },
            ],
          });
        }

        // Security trap: S3 global users endpoint must never be called.
        if (pathname === "/api/v1/storages/users") {
          return ok({ error_code: "forbidden_endpoint", message: "Forbidden" }, 403);
        }

        // === Phase 4 DBaaS ===
        if (req.method === "POST" && pathname === "/api/v1/databases") {
          const id = 6001 + twState.databases.size;
          const cluster = {
            id,
            name: body.name,
            type: body.type,
            location: "ru-1",
            port: 5432,
            status: "started",
            preset_id: body.preset_id,
            cpu: 2,
            ram: 4096,
            disk: 30720,
            project_id: body.project_id,
            networks: [{ type: "public", ips: [{ type: "ipv_4", ip: "198.51.100.88" }] }],
            admins: body.admin ? [{ id: "adm-1", login: body.admin.login }] : [],
            instances: body.instance ? [{ id: "inst-1", name: body.instance.name }] : [],
          };
          twState.databases.set(id, cluster);
          return ok({ db: cluster }, 201);
        }
        const dbMatch = /^\/api\/v1\/databases\/(\d+)(?:\/(.*))?$/.exec(pathname);
        if (dbMatch) {
          const id = Number(dbMatch[1]);
          const sub = dbMatch[2] || "";
          const dbObj = twState.databases.get(id);
          if (!dbObj) return ok({ message: "Not found" }, 404);
          if (!sub && req.method === "GET") return ok({ db: dbObj });
          if (!sub && req.method === "DELETE") {
            twState.databases.delete(id);
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "action" && req.method === "POST") {
            dbObj.status = body.action === "shutdown" ? "off" : "started";
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "admins" && req.method === "GET") return ok({ admins: dbObj.admins });
          if (sub === "admins" && req.method === "POST") {
            const adm = { id: `adm-${dbObj.admins.length + 1}`, login: body.login };
            dbObj.admins.push(adm);
            return ok({ admin: adm }, 201);
          }
          if (sub === "instances" && req.method === "GET") return ok({ instances: dbObj.instances });
          if (sub === "instances" && req.method === "POST") {
            const inst = { id: `inst-${dbObj.instances.length + 1}`, name: body.name };
            dbObj.instances.push(inst);
            return ok({ instance: inst }, 201);
          }
        }

        // === Phase 4 S3 ===
        if (req.method === "POST" && pathname === "/api/v1/storages/buckets") {
          const id = 7001 + twState.buckets.size;
          const bucket = {
            id,
            name: body.name,
            type: body.type || "private",
            preset_id: body.preset_id,
            status: "created",
            location: "ru-1",
            hostname: "s3.twcstorage.ru",
            access_key: "S3ACCESS123",
            secret_key: "S3SECRET999",
            storage_class: "hot",
            project_id: body.project_id,
            subdomains: [],
          };
          twState.buckets.set(id, bucket);
          return ok({ bucket }, 201);
        }
        const s3Match = /^\/api\/v1\/storages\/buckets\/(\d+)(?:\/(.*))?$/.exec(pathname);
        if (s3Match) {
          const id = Number(s3Match[1]);
          const sub = s3Match[2] || "";
          const b = twState.buckets.get(id);
          if (!b) return ok({ message: "Not found" }, 404);
          if (!sub && req.method === "GET") return ok({ bucket: b });
          if (!sub && req.method === "PATCH") {
            if (body.bucket_type) b.type = body.bucket_type;
            return ok({ bucket: b });
          }
          if (!sub && req.method === "DELETE") {
            twState.buckets.delete(id);
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "subdomains" && req.method === "POST") {
            b.subdomains.push(...(body.subdomains || []));
            return ok({ subdomains: b.subdomains, meta: { total: b.subdomains.length } }, 201);
          }
        }
        if (req.method === "POST" && pathname === "/api/v1/storages/certificates/generate") {
          res.writeHead(204);
          res.end();
          return;
        }

        // === Phase 4 K8s ===
        if (req.method === "POST" && pathname === "/api/v1/k8s/clusters") {
          const id = 8001 + twState.k8s.size;
          const cluster = {
            id,
            name: body.name,
            status: "on",
            k8s_version: body.k8s_version,
            network_driver: body.network_driver,
            preset_id: body.preset_id,
            cpu: 2,
            ram: 4096,
            disk: 30720,
            availability_zone: "msk-1",
            project_id: body.project_id,
            nodeGroups: [
              {
                id: 81,
                name: body.worker_groups?.[0]?.name || "workers",
                preset_id: body.preset_id,
                node_count: body.worker_groups?.[0]?.node_count || 1,
              },
            ],
          };
          twState.k8s.set(id, cluster);
          return ok({ cluster }, 201);
        }
        const k8sMatch = /^\/api\/v1\/k8s\/clusters\/(\d+)(?:\/(.*))?$/.exec(pathname);
        if (k8sMatch) {
          const id = Number(k8sMatch[1]);
          const sub = k8sMatch[2] || "";
          const c = twState.k8s.get(id);
          if (!c) return ok({ message: "Not found" }, 404);
          if (!sub && req.method === "GET") return ok({ cluster: c });
          if (!sub && req.method === "DELETE") {
            twState.k8s.delete(id);
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "kubeconfig" && req.method === "GET") {
            res.writeHead(200, { "Content-Type": "application/yaml" });
            res.end("apiVersion: v1\nkind: Config\ncurrent-context: kc-test");
            return;
          }
          if (sub === "groups" && req.method === "GET") {
            return ok({ meta: { total: c.nodeGroups.length }, node_groups: c.nodeGroups });
          }
          const grpMatch = /^groups\/(\d+)\/nodes$/.exec(sub);
          if (grpMatch) {
            const gId = Number(grpMatch[1]);
            const grp = c.nodeGroups.find((g) => g.id === gId);
            if (!grp) return ok({ message: "Not found" }, 404);
            if (req.method === "POST") {
              grp.node_count += Number(body.count || 1);
              return ok({ meta: { total: grp.node_count }, nodes: [] });
            }
            if (req.method === "DELETE") {
              grp.node_count = Math.max(1, grp.node_count - Number(body.count || 1));
              res.writeHead(204);
              res.end();
              return;
            }
          }
        }

        // === Phase 4 CDN ===
        if (req.method === "POST" && pathname === "/api/v1/cdn/http-resources") {
          const id = `cdn-${twState.cdnResources.size + 1}`;
          const cdn = {
            id,
            name: body.name,
            status: "active",
            preset_id: body.preset_id,
            delivery_domain: `${body.name}.cdn.example.net`,
            origin_domain: body.storage_id ? "s3.twcstorage.ru" : body.server?.host,
            use_https: body.use_https !== false,
            project_id: body.project_id,
          };
          twState.cdnResources.set(id, cdn);
          return ok({ http_resource: cdn }, 201);
        }
        const cdnMatch = /^\/api\/v1\/cdn\/http-resources\/([^/]+)(?:\/(.*))?$/.exec(pathname);
        if (cdnMatch) {
          const id = decodeURIComponent(cdnMatch[1]);
          const sub = cdnMatch[2] || "";
          const cdn = twState.cdnResources.get(id);
          if (!cdn) return ok({ message: "Not found" }, 404);
          if (!sub && req.method === "GET") return ok({ http_resource: cdn });
          if (!sub && req.method === "DELETE") {
            twState.cdnResources.delete(id);
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "clear-cache" && req.method === "POST") {
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "suspend" && req.method === "POST") {
            cdn.status = "off";
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "resume" && req.method === "POST") {
            cdn.status = "active";
            res.writeHead(204);
            res.end();
            return;
          }
        }

        // === Phase 4 VPC, Firewall, Floating IP, Network Drive ===
        if (req.method === "POST" && pathname === "/api/v2/vpcs") {
          const id = `vpc-${twState.vpcs.size + 1}`;
          const vpc = { id, ...body };
          twState.vpcs.set(id, vpc);
          return ok({ vpc }, 201);
        }
        if (req.method === "GET" && pathname.startsWith("/api/v2/vpcs/")) {
          const id = decodeURIComponent(pathname.slice("/api/v2/vpcs/".length));
          const v = twState.vpcs.get(id);
          return v ? ok({ vpc: v }) : ok({ message: "Not found" }, 404);
        }
        if (req.method === "DELETE" && pathname.startsWith("/api/v1/vpcs/")) {
          twState.vpcs.delete(decodeURIComponent(pathname.slice("/api/v1/vpcs/".length)));
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === "POST" && pathname === "/api/v1/firewall/groups") {
          const id = `fw-${twState.firewallGroups.size + 1}`;
          const grp = { id, name: body.name, description: body.description || "", rules: [], resources: [] };
          twState.firewallGroups.set(id, grp);
          return ok({ group: grp }, 201);
        }
        const fwMatch = /^\/api\/v1\/firewall\/groups\/([^/]+)(?:\/(.*))?$/.exec(pathname);
        if (fwMatch) {
          const id = decodeURIComponent(fwMatch[1]);
          const sub = fwMatch[2] || "";
          const grp = twState.firewallGroups.get(id);
          if (!grp) return ok({ message: "Not found" }, 404);
          if (!sub && req.method === "GET") return ok({ group: grp });
          if (!sub && req.method === "DELETE") {
            twState.firewallGroups.delete(id);
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "rules" && req.method === "GET") return ok({ rules: grp.rules });
          if (sub === "rules" && req.method === "POST") {
            const rule = { id: `rule-${grp.rules.length + 1}`, ...body };
            grp.rules.push(rule);
            return ok({ rule }, 201);
          }
          if (sub.startsWith("resources/") && req.method === "POST") {
            const resId = decodeURIComponent(sub.slice("resources/".length));
            grp.resources.push(resId);
            return ok({ resource: { id: resId } }, 201);
          }
        }
        if (req.method === "POST" && pathname === "/api/v1/floating-ips") {
          const id = `fip-${twState.floatingIps.size + 1}`;
          const ip = {
            id,
            ip: `203.0.113.${70 + twState.floatingIps.size}`,
            is_ddos_guard: Boolean(body.is_ddos_guard),
            availability_zone: body.availability_zone || "msk-1",
            resource_type: null,
            resource_id: null,
          };
          twState.floatingIps.set(id, ip);
          return ok({ ip }, 201);
        }
        const fipMatch = /^\/api\/v1\/floating-ips\/([^/]+)(?:\/(.*))?$/.exec(pathname);
        if (fipMatch) {
          const id = decodeURIComponent(fipMatch[1]);
          const sub = fipMatch[2] || "";
          const fip = twState.floatingIps.get(id);
          if (!fip) return ok({ message: "Not found" }, 404);
          if (!sub && req.method === "GET") return ok({ ip: fip });
          if (!sub && req.method === "DELETE") {
            twState.floatingIps.delete(id);
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "bind" && req.method === "POST") {
            fip.resource_type = body.resource_type;
            fip.resource_id = body.resource_id;
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "unbind" && req.method === "POST") {
            fip.resource_type = null;
            fip.resource_id = null;
            res.writeHead(204);
            res.end();
            return;
          }
        }
        if (req.method === "POST" && pathname === "/api/v1/network-drives") {
          const id = 9501 + twState.networkDrives.size;
          const drive = {
            id,
            name: body.name,
            size: body.size,
            status: "active",
            preset_id: body.preset_id,
            resource_type: null,
            resource_id: null,
          };
          twState.networkDrives.set(id, drive);
          return ok({ network_drive: drive }, 201);
        }
        const drvMatch = /^\/api\/v1\/network-drives\/(\d+)(?:\/(.*))?$/.exec(pathname);
        if (drvMatch) {
          const id = Number(drvMatch[1]);
          const sub = drvMatch[2] || "";
          const drv = twState.networkDrives.get(id);
          if (!drv) return ok({ message: "Not found" }, 404);
          if (!sub && req.method === "GET") return ok({ network_drive: drv });
          if (!sub && req.method === "DELETE") {
            twState.networkDrives.delete(id);
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "mount" && req.method === "POST") {
            drv.resource_type = body.resource_type;
            drv.resource_id = body.resource_id;
            res.writeHead(204);
            res.end();
            return;
          }
          if (sub === "unmount" && req.method === "POST") {
            drv.resource_type = null;
            drv.resource_id = null;
            res.writeHead(204);
            res.end();
            return;
          }
        }

        // === Phase 4 Domain Corporate Mail ===
        const mailMatch = /^\/api\/v[12]\/mail\/domains\/([^/]+)(?:\/mailboxes\/([^/]+))?$/.exec(pathname);
        if (mailMatch) {
          const fqdn = decodeURIComponent(mailMatch[1]);
          const box = mailMatch[2] ? decodeURIComponent(mailMatch[2]) : null;
          const list = twState.mailboxes.get(fqdn) || [];
          if (!box && req.method === "GET") {
            return ok({ meta: { total: list.length }, mailboxes: list });
          }
          if (!box && req.method === "POST") {
            const entry = {
              fqdn,
              mailbox: body.mailbox,
              password: body.password,
              comment: body.comment || "",
              usage_space: 0,
              owner_full_name: body.owner_full_name || "",
            };
            list.push(entry);
            twState.mailboxes.set(fqdn, list);
            return ok({ mailbox: entry }, 201);
          }
          if (box && req.method === "PATCH") {
            const found = list.find((m) => m.mailbox === box);
            if (!found) return ok({ message: "Not found" }, 404);
            if (body.password) found.password = body.password;
            if (body.comment !== undefined) found.comment = body.comment;
            return ok({ mailbox: found });
          }
          if (box && req.method === "DELETE") {
            twState.mailboxes.set(fqdn, list.filter((m) => m.mailbox !== box));
            res.writeHead(204);
            res.end();
            return;
          }
        }

        res.writeHead(404);
        res.end();
      });
    });
    await new Promise((resolve) => twApiServer.listen(0, "127.0.0.1", resolve));
    const twPort = twApiServer.address().port;

    const listener = createServer();
    await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    twBase = `http://127.0.0.1:${port}`;

    twChild = await startWorker(twDir, port, {
      CLOUD_ORIGIN: twBase,
      CLOUD_DEMO_ENABLED: "true",
      CLOUD_DATA_ENCRYPTION_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      MAILER_WEBHOOK_URL: `http://127.0.0.1:${twMailPort}/mail`,
      YOOKASSA_SHOP_ID: "test-shop",
      YOOKASSA_SECRET_KEY: "test-secret",
      YOOKASSA_API_URL: `http://127.0.0.1:${twYkPort}`,
      YOOKASSA_VERIFY_WEBHOOK_IP: "true",
      CLOUD_INTERNAL_SECRET: "test-internal-secret",
      TIMEWEB_TOKEN: "test-tw-token",
      TIMEWEB_API_URL: `http://127.0.0.1:${twPort}`,
      TIMEWEB_WEBHOOK_SECRET: "tw-hook-secret",
      CLOUD_SALES_ENABLED: "true",
    });
    let twLogs = "";
    twChild.stdout.on("data", (c) => {
      twLogs += c;
    });
    twChild.stderr.on("data", (c) => {
      twLogs += c;
    });
    for (let i = 0; i < 100; i++) {
      if (twChild.exitCode !== null) throw new Error(twLogs);
      try {
        if ((await fetch(twBase, { signal: AbortSignal.timeout(1500) })).ok) return;
      } catch {
        // wait
      }
      await delay(150);
    }
    throw new Error(`Phase 3 server did not start: ${twLogs}`);
  });

  after(async () => {
    if (twChild && twChild.exitCode === null) {
      const stopped = new Promise((r) => twChild.once("exit", r));
      twChild.kill("SIGTERM");
      await Promise.race([stopped, delay(4000)]);
      if (twChild.exitCode === null) {
        twChild.kill("SIGKILL");
        await stopped;
      }
    }
    for (const srv of [twMailServer, twYkServer, twApiServer]) {
      if (srv) await new Promise((r) => srv.close(r));
    }
    if (twDir) await rm(twDir, { recursive: true, force: true });
  });

  function liveClient() {
    let cookie = "";
    return {
      async request(route, body, options = {}) {
        const method = options.method ?? (body === undefined ? "GET" : "POST");
        const hasJsonBody = body !== undefined;
        const response = await fetch(twBase + route, {
          method,
          redirect: "manual",
          headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            ...(method !== "GET" ? { Origin: twBase } : {}),
            ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
          body: hasJsonBody ? JSON.stringify(body) : undefined,
        });
        const session = response.headers
          .getSetCookie()
          .find((v) => v.startsWith("kernell_cloud_session="));
        if (session) cookie = session.split(";")[0];
        const type = response.headers.get("content-type") || "";
        const data = type.includes("application/json")
          ? await response.json()
          : await response.text();
        return { status: response.status, data, headers: response.headers };
      },
    };
  }

  test("live catalog, SSH keys, VPS provisioning, encrypted credentials, webhooks and domain lifecycle work", async () => {
    const userA = liveClient();
    const userB = liveClient();
    const emailA = "reseller-a@example.test";
    const emailB = "reseller-b@example.test";

    await userA.request("/api/auth/register", {
      name: "Антон",
      email: emailA,
      password: "secure-password-a",
      consent: true,
    });
    await userB.request("/api/auth/register", {
      name: "Борис",
      email: emailB,
      password: "secure-password-b",
      consent: true,
    });

    await delay(100);
    const tokenA = twMails
      .find((m) => m.to === emailA)
      ?.text.match(/token=([0-9a-f]{64})/)?.[1];
    assert.ok(tokenA);
    assert.equal(
      (await userA.request("/api/auth/verify-email", { token: tokenA })).status,
      200,
    );

    // 1. Live catalog reflects 20% default markup over Timeweb cost prices.
    const vpsCat = await userA.request("/api/catalog?category=vps");
    assert.equal(vpsCat.status, 200);
    assert.equal(vpsCat.data.source, "timeweb");
    assert.equal(vpsCat.data.presets[0].retailPrice, 600);
    assert.equal(vpsCat.data.locations.length, 2);

    const domCheck = await userA.request("/api/domains/check", {
      query: "my-idea.shop",
    });
    assert.equal(domCheck.status, 200);
    assert.equal(domCheck.data.results[0].status, "available");
    assert.equal(domCheck.data.prices.shop.orderable, true);
    assert.equal(domCheck.data.prices.shop.registration, 359);

    const domCat = await userA.request("/api/catalog?category=domains");
    assert.equal(domCat.status, 200);
    assert.ok(!domCat.data.zones.some((z) => z.zone === "tw1.ru" || z.registration <= 0));

    const freeDomCheck = await userA.request("/api/domains/check", {
      query: "my-idea.tw1.ru",
    });
    assert.equal(freeDomCheck.status, 200);
    assert.equal(freeDomCheck.data.results[0].status, "unsupported");
    assert.equal(freeDomCheck.data.prices?.["tw1.ru"], undefined);

    const domainsPage = await userA.request("/domains");
    assert.equal(domainsPage.status, 200);
    assert.ok(!domainsPage.data.includes("tw1.ru"));

    // 2. SSH keys CRUD and strict ownership isolation.
    const fakePubKey = `ssh-ed25519 ${Buffer.alloc(48, 7).toString("base64")} test@kernell`;
    const sshCreate = await userA.request("/api/ssh-keys", {
      name: "Main Laptop",
      publicKey: fakePubKey,
    });
    assert.equal(sshCreate.status, 200);
    assert.match(sshCreate.data.sshKey.fingerprint, /^SHA256:/);
    assert.equal(sshCreate.data.sshKey.twSshKeyId, 301);
    const sshKeyId = sshCreate.data.sshKey.id;
    assert.equal(
      (
        await userB.request(
          `/api/ssh-keys?id=${encodeURIComponent(sshKeyId)}`,
          undefined,
          { method: "DELETE" },
        )
      ).status,
      404,
    );

    // Top-up wallet (3000 RUB)
    const topup = await userA.request("/api/billing/topup", {
      amountRub: 3000,
      requestKey: "live-topup-req-1",
    });
    assert.equal(topup.status, 200);
    await userA.request(
      `/api/billing/payments/${encodeURIComponent(topup.data.paymentId)}/sync`,
      {},
    );
    assert.equal((await userA.request("/api/account")).data.balance, 3000);

    // 3. Create live VPS order (presetId 101 -> 600 RUB) with SSH key, pay & provision!
    const vpsOrder = await userA.request("/api/orders", {
      kind: "vps",
      presetId: 101,
      osId: 79,
      location: "ru-1",
      name: "api-worker-1",
      sshKeyIds: [sshKeyId],
      isDdosGuard: true,
      requestKey: "live-vps-order-1",
    });
    assert.equal(vpsOrder.status, 200);
    assert.equal(vpsOrder.data.amount, 600);

    const vpsPay = await userA.request(`/api/orders/${vpsOrder.data.id}/pay`, {});
    assert.equal(vpsPay.status, 200);
    assert.equal(vpsPay.data.status, "provisioning");
    assert.equal(vpsPay.data.balanceRub, 2400);
    const vpsServiceId = vpsPay.data.serviceId;
    assert.ok(vpsServiceId);

    const createServerCall = twState.calls.find(
      (c) => c.method === "POST" && c.pathname === "/api/v1/servers",
    );
    assert.equal(createServerCall.body.project_id, 9001);
    assert.deepEqual(createServerCall.body.ssh_keys_ids, [301]);
    assert.equal(createServerCall.body.is_ddos_guard, true);

    // Tenant isolation on details and credentials.
    assert.equal(
      (await userB.request(`/api/services/${vpsServiceId}/details`)).status,
      404,
    );
    assert.equal(
      (await userB.request(`/api/services/${vpsServiceId}/credentials`, {})).status,
      404,
    );

    // Timeweb webhook sync moves provisioning -> running.
    twState.servers.get(5001).status = "on";
    assert.equal(
      (
        await fetch(`${twBase}/api/webhooks/timeweb`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-webhook-secret": "wrong" },
          body: JSON.stringify({ server_id: 5001 }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${twBase}/api/webhooks/timeweb`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": "tw-hook-secret",
          },
          body: JSON.stringify({ server_id: 5001 }),
        })
      ).status,
      200,
    );

    const accAfterWebhook = (await userA.request("/api/account")).data;
    const srvAfter = accAfterWebhook.services.find((s) => s.id === vpsServiceId);
    assert.equal(srvAfter.status, "running");
    assert.equal(srvAfter.address, "198.51.100.55");
    assert.equal(srvAfter.hasCredentials, true);
    // Account payload must NEVER contain plaintext rootPass.
    assert.equal(JSON.stringify(accAfterWebhook).includes("InitialRootPass!9"), false);

    // Details hides credentials; credentials endpoint reveals encrypted password.
    const details = await userA.request(`/api/services/${vpsServiceId}/details`);
    assert.equal(details.status, 200);
    assert.equal(JSON.stringify(details.data).includes("InitialRootPass!9"), false);
    const creds = await userA.request(`/api/services/${vpsServiceId}/credentials`, {});
    assert.equal(creds.data.rootPass, "InitialRootPass!9");
    assert.equal(creds.data.vncPass, "VncPass!42");

    // VPS controls: stop -> start -> reset_password -> add_disk -> reinstall -> delete
    assert.equal(
      (await userA.request(`/api/services/${vpsServiceId}`, { action: "stop" })).status,
      200,
    );
    assert.equal(
      (await userA.request(`/api/services/${vpsServiceId}`, { action: "start" })).status,
      200,
    );
    assert.equal(
      (await userA.request(`/api/services/${vpsServiceId}`, { action: "reset_password" })).status,
      200,
    );
    const rotated = await userA.request(`/api/services/${vpsServiceId}/credentials`, {});
    assert.equal(rotated.data.rootPass, "RotatedRootPass!2");
    assert.equal(
      (await userA.request(`/api/services/${vpsServiceId}`, { action: "add_disk", sizeMb: 10240 })).status,
      200,
    );
    assert.equal(twState.servers.get(5001).disks.length, 2);
    assert.equal(
      (await userA.request(`/api/services/${vpsServiceId}`, { action: "reinstall", osId: 80, confirm: true })).status,
      200,
    );
    assert.equal(
      (await userA.request(`/api/services/${vpsServiceId}`, { action: "delete", confirm: true })).status,
      200,
    );
    assert.equal(twState.servers.has(5001), false);

    // 4. Domain registration requires saved person profile before debit, refunds on taken domain, succeeds on free domain!
    const takenOrder = await userA.request("/api/orders", {
      kind: "domain",
      name: "taken-domain.ru",
      requestKey: "live-domain-taken-1",
    });
    assert.equal(takenOrder.status, 200);
    // Rejects payment cleanly before debiting wallet when person profile is missing.
    assert.equal(
      (await userA.request(`/api/orders/${takenOrder.data.id}/pay`, {})).status,
      400,
    );
    assert.equal((await userA.request("/api/account")).data.balance, 2400);

    const personRes = await userA.request("/api/persons", {
      type: "person",
      name: "Антонов Антон Антонович",
      isResident: true,
      birthdate: "1990-01-15",
      passportSeries: "4511",
      passportNumber: "112233",
      passportDate: "2010-03-10",
      passportPlace: "ОВД Москва",
      postcode: "101000",
      mailingAddress: "г. Москва, ул. Тверская, д. 1",
      phone: "+79001112244",
      email: emailA,
    });
    assert.equal(personRes.status, 200);
    const personId = personRes.data.person.id;

    // Taken domain attempt refunds atomically back to 2400.
    const takenPay = await userA.request(`/api/orders/${takenOrder.data.id}/pay`, {
      personId,
    });
    assert.equal(takenPay.status, 400);
    assert.equal((await userA.request("/api/account")).data.balance, 2400);

    // Valid .shop domain for 2 years with WHOIS privacy: (359 + 180) * 2 = 1078 RUB.
    const shopOrder = await userA.request("/api/orders", {
      kind: "domain",
      name: "my-idea.shop",
      action: "register",
      period: "P2Y",
      whoisPrivacy: true,
      personId,
      requestKey: "live-domain-shop-1",
    });
    assert.equal(shopOrder.status, 200);
    assert.equal(shopOrder.data.amount, 1078);

    const shopPay = await userA.request(`/api/orders/${shopOrder.data.id}/pay`, {});
    assert.equal(shopPay.status, 200);
    assert.equal(shopPay.data.status, "active");
    assert.equal(shopPay.data.balanceRub, 1322);
    const domainServiceId = shopPay.data.serviceId;
    assert.ok(domainServiceId);

    // NS update + auto-renew toggle + DNS v2 CRUD (with subdomain creation)
    assert.equal(
      (
        await userA.request(`/api/services/${domainServiceId}`, {
          action: "dns",
          nameservers: ["ns1.kernell.example", "ns2.kernell.example"],
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await userA.request(`/api/services/${domainServiceId}`, {
          action: "renewal",
          enabled: false,
        })
      ).status,
      200,
    );
    const dnsAddRoot = await userA.request(`/api/services/${domainServiceId}/dns`, {
      type: "TXT",
      value: "v=spf1 ~all",
      ttl: 600,
    });
    assert.equal(dnsAddRoot.status, 200);
    const dnsAddSub = await userA.request(`/api/services/${domainServiceId}/dns`, {
      type: "A",
      subdomain: "www",
      value: "198.51.100.55",
      ttl: 300,
    });
    assert.equal(dnsAddSub.status, 200);
    assert.equal(dnsAddSub.data.record.data.subdomain, "www");

    const dnsList = await userA.request(`/api/services/${domainServiceId}/dns`);
    assert.equal(dnsList.status, 200);
    assert.equal(dnsList.data.records.length, 2);

    assert.equal(
      (
        await userA.request(
          `/api/services/${domainServiceId}/dns?recordId=${dnsAddRoot.data.record.id}`,
          undefined,
          { method: "DELETE" },
        )
      ).status,
      200,
    );
    assert.equal(
      (await userA.request(`/api/services/${domainServiceId}/dns`)).data.records.length,
      1,
    );

    // =========================================================================
    // PHASE 4: DBaaS, S3, K8s, CDN, VPC, Firewall, Floating IP, Network Drive, Mail
    // =========================================================================

    // Top-up wallet (+10000 RUB) -> 11322 RUB total.
    const topup2 = await userA.request("/api/billing/topup", {
      amountRub: 10000,
      requestKey: "live-topup-req-2",
    });
    assert.equal(topup2.status, 200);
    assert.equal((await userA.request("/api/account")).data.balance, 11322);

    // Also register & verify userB email so userB can create own resources for cross-tenant tests.
    const tokenB = twMails
      .find((m) => m.to === emailB)
      ?.text.match(/token=([0-9a-f]{64})/)?.[1];
    assert.ok(tokenB);
    assert.equal(
      (await userB.request("/api/auth/verify-email", { token: tokenB })).status,
      200,
    );

    // 5. DBaaS: create PostgreSQL 16 cluster (1000 cost -> 1200 retail), encrypted creds, actions & DB creation.
    const dbOrder = await userA.request("/api/orders", {
      kind: "database",
      name: "app-pg-1",
      dbType: "postgres16",
      presetId: 201,
      adminLogin: "pg_owner",
      requestKey: "live-db-order-1",
    });
    assert.equal(dbOrder.status, 200);
    assert.equal(dbOrder.data.amount, 1200);
    const dbPay = await userA.request(`/api/orders/${dbOrder.data.id}/pay`, {});
    assert.equal(dbPay.status, 200);
    assert.equal(dbPay.data.status, "active");
    const dbServiceId = dbPay.data.serviceId;
    assert.equal(
      (await userA.request(`/api/services/${dbServiceId}/credentials`, {})).data.dbLogin,
      "pg_owner",
    );
    assert.ok(
      (await userA.request(`/api/services/${dbServiceId}/credentials`, {})).data.dbPassword,
    );
    assert.equal(
      (await userA.request(`/api/services/${dbServiceId}`, { action: "add_database", name: "billing_db" })).status,
      200,
    );
    assert.equal(
      (await userA.request(`/api/services/${dbServiceId}`, { action: "stop" })).status,
      200,
    );
    assert.equal(
      (await userB.request(`/api/services/${dbServiceId}/credentials`, {})).status,
      404,
    );

    // 6. S3 Storage: create private bucket (200 -> 240 retail), verify /storages/users never called & credentials encrypted.
    const s3Order = await userA.request("/api/orders", {
      kind: "s3",
      name: "kernell-media-1",
      bucketType: "private",
      presetId: 301,
      requestKey: "live-s3-order-1",
    });
    assert.equal(s3Order.status, 200);
    assert.equal(s3Order.data.amount, 240);
    const s3Pay = await userA.request(`/api/orders/${s3Order.data.id}/pay`, {});
    assert.equal(s3Pay.status, 200);
    const s3ServiceId = s3Pay.data.serviceId;
    const s3Creds = await userA.request(`/api/services/${s3ServiceId}/credentials`, {});
    assert.equal(s3Creds.data.s3AccessKey, "S3ACCESS123");
    assert.equal(s3Creds.data.s3SecretKey, "S3SECRET999");
    assert.equal(
      twState.calls.some((c) => c.pathname.includes("/storages/users")),
      false,
    );
    assert.equal(
      (await userA.request(`/api/services/${s3ServiceId}`, { action: "set_visibility", bucketType: "public" })).status,
      200,
    );

    // 7. Managed Kubernetes: 1 master (800) + 2 workers (1600) = 2400 -> 2880 retail, YAML kubeconfig & scale.
    const k8sOrder = await userA.request("/api/orders", {
      kind: "k8s",
      name: "prod-cluster",
      k8sVersion: "1.30",
      networkDriver: "cilium",
      presetId: 401,
      workerPresetId: 401,
      workerCount: 2,
      requestKey: "live-k8s-order-1",
    });
    assert.equal(k8sOrder.status, 200);
    assert.equal(k8sOrder.data.amount, 2880);
    const k8sPay = await userA.request(`/api/orders/${k8sOrder.data.id}/pay`, {});
    assert.equal(k8sPay.status, 200);
    const k8sServiceId = k8sPay.data.serviceId;
    const k8sCreds = await userA.request(`/api/services/${k8sServiceId}/credentials`, {});
    assert.match(k8sCreds.data.kubeconfig, /kind: Config/);
    assert.equal(
      (await userA.request(`/api/services/${k8sServiceId}`, { action: "scale", groupId: 81, delta: 1 })).status,
      200,
    );
    assert.equal(twState.k8s.get(8001).nodeGroups[0].node_count, 3);

    // 8. CDN linked to own S3 (300 -> 360 retail) + cross-tenant S3 linkage blocked.
    assert.equal(
      (
        await userB.request("/api/orders", {
          kind: "cdn",
          name: "stolen-cdn",
          presetId: 601,
          storageServiceId: s3ServiceId,
          requestKey: "cdn-stolen-req",
        })
      ).status,
      404,
    );
    const cdnOrder = await userA.request("/api/orders", {
      kind: "cdn",
      name: "media-cdn",
      presetId: 601,
      storageServiceId: s3ServiceId,
      requestKey: "live-cdn-order-1",
    });
    assert.equal(cdnOrder.status, 200);
    const cdnPay = await userA.request(`/api/orders/${cdnOrder.data.id}/pay`, {});
    assert.equal(cdnPay.status, 200);
    assert.equal(
      (await userA.request(`/api/services/${cdnPay.data.serviceId}`, { action: "clear_cache" })).status,
      200,
    );

    // 9. Account-global network isolation: VPS, VPC, Firewall, Floating IP, Network Drive.
    const vps2Order = await userA.request("/api/orders", {
      kind: "vps",
      presetId: 101,
      osId: 79,
      location: "ru-1",
      name: "app-net-1",
      requestKey: "live-vps-net-1",
    });
    const vps2Id = (await userA.request(`/api/orders/${vps2Order.data.id}/pay`, {})).data.serviceId;

    // userB creates its own firewall group -> userA cannot link userB's firewall or target userB's resources.
    const fwB = await userB.request("/api/infra/resources", { kind: "firewall", name: "b-fw" });
    assert.equal(fwB.status, 200);

    const vpcA = await userA.request("/api/infra/resources", {
      kind: "vpc",
      name: "a-private",
      location: "ru-1",
      subnetV4: "10.10.0.0/24",
    });
    assert.equal(vpcA.status, 200);

    const fwA = await userA.request("/api/infra/resources", { kind: "firewall", name: "a-fw" });
    assert.equal(fwA.status, 200);

    const fipOrder = await userA.request("/api/orders", {
      kind: "floating_ip",
      availabilityZone: "msk-1",
      isDdosGuard: false,
      requestKey: "live-fip-order-1",
    });
    const fipId = (await userA.request(`/api/orders/${fipOrder.data.id}/pay`, {})).data.serviceId;

    const drvOrder = await userA.request("/api/orders", {
      kind: "network_drive",
      name: "shared-nvme",
      presetId: 801,
      sizeGb: 20,
      requestKey: "live-drv-order-1",
    });
    assert.equal(drvOrder.data.amount, 240);
    const drvId = (await userA.request(`/api/orders/${drvOrder.data.id}/pay`, {})).data.serviceId;

    // Cross-tenant binding attacks rejected with 404.
    assert.equal(
      (await userB.request(`/api/services/${fipId}`, { action: "bind", targetServiceId: vps2Id })).status,
      404,
    );
    assert.equal(
      (await userA.request(`/api/services/${fipId}`, { action: "bind", targetServiceId: fwB.data.id })).status,
      404,
    );

    // Valid owner bindings & mounts succeed.
    assert.equal(
      (await userA.request(`/api/services/${fipId}`, { action: "bind", targetServiceId: vps2Id })).status,
      200,
    );
    assert.equal(
      (await userA.request(`/api/services/${drvId}`, { action: "mount", targetServiceId: vps2Id })).status,
      200,
    );
    assert.equal(
      (
        await userA.request(`/api/services/${fwA.data.id}`, {
          action: "add_rule",
          direction: "ingress",
          protocol: "tcp",
          port: "443",
          cidr: "0.0.0.0/0",
        })
      ).status,
      200,
    );
    assert.equal(
      (await userA.request(`/api/services/${fwA.data.id}`, { action: "link", targetServiceId: vps2Id })).status,
      200,
    );

    // 10. Corporate Domain Mail scoped strictly to domain owner.
    assert.equal(
      (await userB.request(`/api/services/${domainServiceId}/mail`)).status,
      404,
    );
    const mailCreate = await userA.request(`/api/services/${domainServiceId}/mail`, {
      mailbox: "info",
      password: "MailboxSecret!1",
      comment: "Support inbox",
    });
    assert.equal(mailCreate.status, 200);
    const mailList = await userA.request(`/api/services/${domainServiceId}/mail`);
    assert.equal(mailList.status, 200);
    assert.equal(mailList.data.mailboxes.length, 1);
    assert.equal(mailList.data.mailboxes[0].mailbox, "info");
    // Passwords must be stripped from mailbox list response.
    assert.equal(mailList.data.mailboxes[0].password, undefined);
    assert.equal(
      (
        await userA.request(`/api/services/${domainServiceId}/mail`, {
          mailbox: "info",
          password: "MailboxSecret!2",
        }, { method: "PATCH" })
      ).status,
      200,
    );
    assert.equal(
      (
        await userA.request(
          `/api/services/${domainServiceId}/mail?mailbox=info`,
          undefined,
          { method: "DELETE" },
        )
      ).status,
      200,
    );
    assert.equal(
      (await userA.request(`/api/services/${domainServiceId}/mail`)).data.mailboxes.length,
      0,
    );

    // Check /dashboard/infra SSR page renders cleanly.
    const infraPage = await userA.request("/dashboard/infra");
    assert.equal(infraPage.status, 200);
    assert.match(infraPage.data, /Облачная инфраструктура/);
  });
});
