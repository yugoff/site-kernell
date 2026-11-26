import { cpSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = path.join(root, "cloud", ".next");
const standalone = path.join(build, "standalone", "cloud");
const server = path.join(standalone, "server.js");

if (!existsSync(server)) {
  console.error("Cloud ещё не собран. Сначала выполните npm run build:cloud.");
  process.exit(1);
}

cpSync(path.join(build, "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});
const envFile = path.join(root, "cloud", ".env.local");
const env = {
  ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {}),
  ...process.env,
};
const child = spawn(process.execPath, [server], {
  cwd: path.join(root, "cloud"),
  env: {
    ...env,
    PORT: env.PORT || "3001",
    HOSTNAME: env.CLOUD_HOSTNAME || "127.0.0.1",
    CLOUD_DATABASE_PATH:
      env.CLOUD_DATABASE_PATH ||
      path.join(root, "cloud", ".data", "cloud.sqlite"),
  },
  stdio: "inherit",
});

for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
process.on("exit", () => {
  if (child.exitCode === null) child.kill("SIGTERM");
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
