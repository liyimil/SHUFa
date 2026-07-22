import { spawn } from "node:child_process";
import console from "node:console";
import { get } from "node:http";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import "./prepare-standalone.mjs";

const webOrigin = "http://127.0.0.1:3100";
const apiHealthUrl = "http://127.0.0.1:3101/__test__/health";
const children = [
  spawn(process.execPath, ["e2e/mock-api.mjs"], { stdio: "inherit" }),
  spawn(process.execPath, [".next/standalone/apps/web/server.js"], {
    env: {
      ...process.env,
      API_BASE_URL: "http://127.0.0.1:3101",
      HOSTNAME: "127.0.0.1",
      PORT: "3100",
      PUBLIC_WEB_URL: webOrigin,
    },
    stdio: "inherit",
  }),
];

let stopping = false;

function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.once("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    console.error(
      `Audit server exited before shutdown (code=${String(code)}, signal=${String(signal)}).`,
    );
    stop(1);
  });
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

async function waitFor(url) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const statusCode = await new Promise((resolve, reject) => {
        const request = get(url, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        });
        request.setTimeout(2_000, () => request.destroy(new Error("timeout")));
        request.once("error", reject);
      });
      if (statusCode >= 200 && statusCode < 400) return;
    } catch {
      // The production servers are still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

try {
  await Promise.all([waitFor(apiHealthUrl), waitFor(webOrigin)]);
  console.log("audit servers ready");
} catch (error) {
  console.error(error);
  stop(1);
}
