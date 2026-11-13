#!/usr/bin/env node
/**
 * D1-07 - Setu Guide reachability check.
 *
 * Calls GET {GUIDE_SERVICE_URL}/health and prints PASS or FAIL.
 * The URL is never printed and no credential is read, so the output is safe
 * to paste into a ticket or a PR.
 *
 * Usage: npm run check:guide
 */
try {
  require("dotenv").config();
} catch {
  // dotenv is optional: when dependencies are not installed yet, rely on the
  // environment variables that are already set in the shell.
}

const http = require("http");
const https = require("https");

const raw = (process.env.GUIDE_SERVICE_URL || "").trim();

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!raw || raw.includes("REPLACE-WITH")) {
  fail("GUIDE_SERVICE_URL is not set. Set it to the Setu Guide base URL in the host environment.");
}

let healthUrl;
try {
  healthUrl = new URL(`${raw.replace(/\/+$/, "")}/health`);
} catch {
  fail("GUIDE_SERVICE_URL is not a valid URL.");
}

if (healthUrl.protocol !== "https:" && healthUrl.protocol !== "http:") {
  fail("GUIDE_SERVICE_URL must start with http:// or https://.");
}

const client = healthUrl.protocol === "https:" ? https : http;
// Render free instances cold-start in ~20-40s, so allow a generous timeout.
const timeoutMs = 60000;

const request = client.get(healthUrl, { timeout: timeoutMs }, (response) => {
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk) => {
    body += chunk;
  });
  response.on("end", () => {
    if (response.statusCode !== 200) {
      fail(`Setu Guide /health returned HTTP ${response.statusCode}.`);
    }
    try {
      const parsed = JSON.parse(body);
      if (parsed && parsed.status && parsed.status !== "ok") {
        fail(`Setu Guide /health reported status "${parsed.status}".`);
      }
    } catch {
      // A non-JSON body is fine as long as the status code is 200.
    }
    console.log("PASS: Setu Guide /health responded 200.");
    process.exit(0);
  });
});

request.on("timeout", () => {
  const error = new Error("timeout");
  error.code = "TIMEOUT";
  request.destroy(error);
});

request.on("error", (error) => {
  if (error.code === "TIMEOUT") {
    fail(`Setu Guide /health did not answer within ${timeoutMs / 1000}s.`);
  }
  const reason = error.code || error.message || "network error";
  fail(`Setu Guide /health could not be reached (${reason}).`);
});
