import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Keep a separate artifact for the chess domain, independent of the main site.
const destination = path.resolve("out-chess");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of ["index.html", "index.txt", "_next", "chess", "404.html", "icon.svg"]) {
  await cp(path.resolve("out", entry), path.join(destination, entry), { recursive: true, force: true });
}
await writeFile(path.join(destination, ".nojekyll"), "");
console.log(`Chess export: ${destination}`);
