import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

let child, directory, base;
let logs = "";
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "kernell-cloud-test-"));
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["scripts/start-cloud.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CLOUD_HOSTNAME: "127.0.0.1",
      CLOUD_DATABASE_PATH: path.join(directory, "test.sqlite"),
      CLOUD_ORIGIN: base,
      CLOUD_DEMO_ENABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
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
  if (directory) await rm(directory, { recursive: true, force: true });
});

function client() {
  let cookie = "";
  return {
    async request(route, body, options = {}) {
      const response = await fetch(base + route, {
        method: body === undefined ? "GET" : "POST",
        redirect: "manual",
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body === undefined
            ? {}
            : { "Content-Type": "application/json", Origin: base }),
          ...options.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
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
