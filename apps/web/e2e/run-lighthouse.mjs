import { spawn } from "node:child_process";
import console from "node:console";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.join(webRoot, "lighthouse-results");
const targets = [
  { name: "home", url: "http://127.0.0.1:3100/" },
  {
    name: "character-yong",
    url: "http://127.0.0.1:3100/characters/%E6%B0%B8",
  },
];
const budgets = {
  accessibility: 1,
  bestPractices: 0.95,
  cumulativeLayoutShift: 0.1,
  firstContentfulPaintMs: 3_000,
  largestContentfulPaintMs: 3_000,
  performance: 0.9,
  seo: 0.9,
  serverResponseTimeMs: 800,
  totalBlockingTimeMs: 200,
};
const runsPerTarget = 3;

function startServers() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["e2e/start-audit-servers.mjs"], {
      cwd: webRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = false;

    child.stdout.on("data", (chunk) => {
      const message = chunk.toString();
      process.stdout.write(message);
      if (!ready && message.includes("audit servers ready")) {
        ready = true;
        resolve(child);
      }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (!ready) {
        reject(
          new Error(
            `Audit servers exited early (code=${String(code)}, signal=${String(signal)}).`,
          ),
        );
      }
    });
  });
}

function metricSummary(lhr) {
  return {
    accessibility: lhr.categories.accessibility.score,
    bestPractices: lhr.categories["best-practices"].score,
    cumulativeLayoutShift: lhr.audits["cumulative-layout-shift"].numericValue,
    firstContentfulPaintMs: lhr.audits["first-contentful-paint"].numericValue,
    largestContentfulPaintMs:
      lhr.audits["largest-contentful-paint"].numericValue,
    performance: lhr.categories.performance.score,
    seo: lhr.categories.seo.score,
    serverResponseTimeMs: lhr.audits["server-response-time"].numericValue,
    totalBlockingTimeMs: lhr.audits["total-blocking-time"].numericValue,
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function medianMetrics(results) {
  return Object.fromEntries(
    Object.keys(results[0].metrics).map((metric) => [
      metric,
      median(results.map((result) => result.metrics[metric])),
    ]),
  );
}

function budgetDeviations(metrics) {
  const deviations = [];
  for (const category of [
    "accessibility",
    "bestPractices",
    "performance",
    "seo",
  ]) {
    if (metrics[category] < budgets[category]) {
      deviations.push(
        `${category} ${metrics[category]} < ${budgets[category]}`,
      );
    }
  }
  for (const metric of [
    "cumulativeLayoutShift",
    "firstContentfulPaintMs",
    "largestContentfulPaintMs",
    "serverResponseTimeMs",
    "totalBlockingTimeMs",
  ]) {
    if (metrics[metric] > budgets[metric]) {
      deviations.push(`${metric} ${metrics[metric]} > ${budgets[metric]}`);
    }
  }
  return deviations;
}

if (
  path.dirname(outputDirectory) !== webRoot ||
  path.basename(outputDirectory) !== "lighthouse-results"
) {
  throw new Error("Refusing to replace an unexpected Lighthouse output path.");
}
await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

const serverProcess = await startServers();
let chrome;
const results = [];
try {
  chrome = await launch({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
    chromePath: chromium.executablePath(),
  });

  for (const target of targets) {
    for (let run = 1; run <= runsPerTarget; run += 1) {
      console.log(`Lighthouse ${target.name} run ${run}/${runsPerTarget}`);
      const audit = await lighthouse(target.url, {
        logLevel: "error",
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
        output: ["json", "html"],
        port: chrome.port,
      });
      if (!audit)
        throw new Error(`Lighthouse returned no result for ${target.url}.`);
      const reports = Array.isArray(audit.report)
        ? audit.report
        : [audit.report];
      const baseName = `${target.name}-run-${run}`;
      await Promise.all([
        writeFile(
          path.join(outputDirectory, `${baseName}.report.json`),
          reports[0],
          "utf8",
        ),
        writeFile(
          path.join(outputDirectory, `${baseName}.report.html`),
          reports[1],
          "utf8",
        ),
      ]);
      results.push({
        metrics: metricSummary(audit.lhr),
        run,
        target: target.name,
        url: audit.lhr.finalUrl,
      });
    }
  }
} finally {
  if (chrome) await chrome.kill();
  serverProcess.kill();
}

const targetsSummary = targets.map((target) => {
  const targetResults = results.filter(
    (result) => result.target === target.name,
  );
  const metrics = medianMetrics(targetResults);
  return {
    deviations: budgetDeviations(metrics),
    metrics,
    target: target.name,
    url: target.url,
  };
});
const summary = {
  budgets,
  generatedAt: new Date().toISOString(),
  method:
    "Lighthouse 13 mobile simulated throttling against Next.js standalone and a local controlled API; median of three runs",
  results,
  targets: targetsSummary,
};
await writeFile(
  path.join(outputDirectory, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);

for (const target of targetsSummary) {
  const metrics = target.metrics;
  console.log(
    `${target.target}: performance=${Math.round(metrics.performance * 100)}, accessibility=${Math.round(metrics.accessibility * 100)}, best-practices=${Math.round(metrics.bestPractices * 100)}, SEO=${Math.round(metrics.seo * 100)}, FCP=${Math.round(metrics.firstContentfulPaintMs)}ms, LCP=${Math.round(metrics.largestContentfulPaintMs)}ms, TTFB=${Math.round(metrics.serverResponseTimeMs)}ms, TBT=${Math.round(metrics.totalBlockingTimeMs)}ms, CLS=${metrics.cumulativeLayoutShift}`,
  );
  for (const deviation of target.deviations) console.error(`  ${deviation}`);
}

if (targetsSummary.some((target) => target.deviations.length > 0)) {
  process.exitCode = 1;
}
