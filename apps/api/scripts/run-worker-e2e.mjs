import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const pnpmExecutable = process.env.npm_execpath ? process.execPath : "pnpm";
const pnpmPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];
const python = path.join(
  root,
  "apps",
  "ai-service",
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);
const children = [];

function start(command, args, environment = process.env) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...environment, NODE_ENV: "development" },
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  return child;
}

async function run(command, args, environment = process.env) {
  const child = start(command, args, environment);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  children.splice(children.indexOf(child), 1);
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${code}.`);
  }
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(`Port ${port} is already in use; stop that service first.`),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

async function waitForHealth(url, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${url} service exited with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function waitForWorker(child) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (child.exitCode !== null) {
    throw new Error(`Worker exited with code ${child.exitCode}.`);
  }
}

async function stopChildren() {
  const running = children.filter((child) => child.exitCode === null);
  for (const child of running) child.kill("SIGTERM");
  await Promise.all(
    running.map(
      (child) =>
        new Promise((resolve) => {
          child.once("exit", resolve);
          setTimeout(resolve, 5_000).unref();
        }),
    ),
  );
  for (const child of running) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function main() {
  await Promise.all([assertPortAvailable(3001), assertPortAvailable(8000)]);

  const nullEnvFile = process.platform === "win32" ? "NUL" : "/dev/null";
  await run(
    "docker",
    ["compose", "--env-file", nullEnvFile, "up", "-d", "--wait"],
    { ...process.env, COMPOSE_DISABLE_ENV_FILE: "true" },
  );
  await run(pnpmExecutable, [
    ...pnpmPrefix,
    "--filter",
    "@calligraphy/api",
    "exec",
    "prisma",
    "migrate",
    "deploy",
    "--config",
    "prisma.config.ts",
  ]);

  const api = start(process.execPath, ["apps/api/dist/main.js"]);
  const ai = start(python, [
    "-m",
    "uvicorn",
    "calligraphy_ai.main:app",
    "--app-dir",
    "apps/ai-service/src",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
  ]);
  await Promise.all([
    waitForHealth("http://127.0.0.1:3001/api/v1/health", api),
    waitForHealth("http://127.0.0.1:8000/health", ai),
  ]);

  const worker = start(process.execPath, ["apps/worker/dist/index.js"]);
  await waitForWorker(worker);
  await run(pnpmExecutable, [
    ...pnpmPrefix,
    "--filter",
    "@calligraphy/api",
    "exec",
    "tsx",
    "scripts/worker-e2e.mjs",
  ]);
}

try {
  await main();
} finally {
  await stopChildren();
}
