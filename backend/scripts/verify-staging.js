#!/usr/bin/env node
/**
 * D2-21 - post-deploy verification for the staging backend.
 *
 * Checks the public endpoints the app team depends on. It never prints the
 * base URL's credentials (there should not be any) and never prints response
 * bodies - only status codes and timings.
 *
 * Usage:
 *   STAGING_BASE_URL=https://<backend-host> npm run verify:staging
 *   node scripts/verify-staging.js --url https://<backend-host>
 */
const http = require("node:http");
const https = require("node:https");

const TIMEOUT_MS = 45000; // Render free cold start can take ~30s

function readBaseUrl() {
  const argIndex = process.argv.indexOf("--url");
  const raw = (argIndex !== -1 ? process.argv[argIndex + 1] : process.env.STAGING_BASE_URL) || "";
  const value = raw.trim();
  if (!value) {
    console.error("FAIL: pass --url or set STAGING_BASE_URL.");
    process.exit(1);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.error("FAIL: the base URL is not a valid URL.");
    process.exit(1);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    console.error("FAIL: the base URL must start with http:// or https://.");
    process.exit(1);
  }
  return parsed;
}

function request(url) {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const req = client.get(url, { timeout: TIMEOUT_MS }, (res) => {
      res.resume(); // discard the body: we only care about the status
      res.on("end", () => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        resolve({ status: res.statusCode, ms: Math.round(ms) });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ error: `no response within ${TIMEOUT_MS / 1000}s` });
    });
    req.on("error", (error) => resolve({ error: error.code || "request failed" }));
  });
}

async function main() {
  const base = readBaseUrl();
  const basePath = base.pathname.replace(/\/+$/, "");
  const checks = [
    { name: "root", path: `${basePath}/`, expect: [200] },
    { name: "health", path: `${basePath}/health`, expect: [200] },
    { name: "health/live", path: `${basePath}/health/live`, expect: [200] },
    { name: "health/ready", path: `${basePath}/health/ready`, expect: [200] },
  ];

  let failed = 0;
  for (const check of checks) {
    const url = new URL(base.toString());
    url.pathname = check.path;
    const result = await request(url);
    if (result.error) {
      failed += 1;
      console.log(`FAIL ${check.name.padEnd(14)} ${result.error}`);
      continue;
    }
    const ok = check.expect.includes(result.status);
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"} ${check.name.padEnd(14)} HTTP ${result.status} in ${result.ms}ms`);
  }

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll staging checks passed.");
}

main();
