import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const standaloneRoot = path.join(webRoot, ".next", "standalone", "apps", "web");

for (const relativePath of [".next/static", "public"]) {
  const source = path.join(webRoot, relativePath);
  if (!existsSync(source)) continue;
  const destination = path.join(standaloneRoot, relativePath);
  cpSync(source, destination, { force: true, recursive: true });
}
