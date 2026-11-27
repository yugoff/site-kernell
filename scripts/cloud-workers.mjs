import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const cloud = fileURLToPath(new URL("../cloud/", import.meta.url));
const root = path.dirname(cloud);
const output = path.join(cloud, ".open-next");
const runtimeEnv = path.join(output, "cloudflare", "next-env.mjs");
const emptyRuntimeEnv = 'export const development = {};\nexport const production = {};\nexport const test = {};\n';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: cloud,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal}).`);
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(filename);
    return entry.isFile() ? [filename] : [];
  });
}

function assertCleanWorker() {
  if (!existsSync(runtimeEnv) || readFileSync(runtimeEnv, "utf8") !== emptyRuntimeEnv) {
    throw new Error("Build a sanitized Worker with npm run build:cloud.");
  }
  const configurations = [
    process.env,
    ...[root, cloud].flatMap((directory) => readdirSync(directory)
      .filter((name) => /^\.env(?:$|\.(?:local|development|production|test)(?:\.local)?)$|^\.dev\.vars(?:$|\.(?!example$)[\w-]+$)/.test(name))
      .map((name) => parseEnv(readFileSync(path.join(directory, name), "utf8")))),
  ];
  const secretNames = [
    "TIMEWEB_TOKEN", "TIMEWEB_WEBHOOK_SECRET", "CLOUD_INTERNAL_SECRET",
    "CLOUD_DATA_ENCRYPTION_KEY", "MAILER_WEBHOOK_TOKEN", "MAILER_WEBHOOK_URL", "YOOKASSA_SECRET_KEY",
  ];
  const secrets = new Set(configurations.flatMap((env) =>
    secretNames.map((name) => env[name]?.trim()).filter((value) => value?.length >= 8)));
  for (const filename of files(output)) {
    if (/^\.env(?:$|\.)|^\.dev\.vars(?:$|\.)/.test(path.basename(filename))) {
      throw new Error("An environment file was found inside the Worker build.");
    }
    if (secrets.size) {
      const contents = readFileSync(filename);
      if ([...secrets].some((secret) => contents.includes(secret))) {
        throw new Error("A local secret was found inside the Worker build.");
      }
    }
  }
}

function build() {
  try {
    run("opennextjs-cloudflare", ["build"]);
  } finally {
    // OpenNext compiles .env files into this module for every mode.
    // Runtime settings belong to Worker bindings and never to this artifact.
    if (existsSync(runtimeEnv)) writeFileSync(runtimeEnv, emptyRuntimeEnv);
  }
  assertCleanWorker();
}

function wranglerRemote(action) {
  const id = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
  if (!id || id === "00000000-0000-0000-0000-000000000000" ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Set CLOUDFLARE_D1_DATABASE_ID to the ID of kernell-cloud-db.");
  }
  const config = JSON.parse(readFileSync(path.join(cloud, "wrangler.jsonc"), "utf8"));
  config.d1_databases[0].database_id = id;
  const origin = process.env.CLOUDFLARE_WORKERS_ORIGIN?.trim();
  if (origin) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) {
      throw new Error("CLOUDFLARE_WORKERS_ORIGIN must be a bare HTTPS origin.");
    }
    config.vars.CLOUD_ORIGIN = origin;
  }
  const filename = path.join(cloud, `wrangler.deploy.${process.pid}.json`);
  writeFileSync(filename, JSON.stringify(config), { flag: "wx", mode: 0o600 });
  try {
    if (action === "deploy") {
      assertCleanWorker();
      run("wrangler", ["deploy", "--config", filename]);
    } else {
      run("wrangler", ["d1", "migrations", "apply", "DB", "--remote", "--config", filename]);
    }
  } finally {
    rmSync(filename, { force: true });
  }
}

const action = process.argv[2];
if (action === "build") build();
else if (action === "deploy" || action === "migrate") wranglerRemote(action);
else throw new Error("Expected build, deploy or migrate.");
