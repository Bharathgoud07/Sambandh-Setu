#!/usr/bin/env node
"use strict";

// D2-28 OTP email deliverability helper.
// This script only triggers the OTP request and records HTTP status/latency.
// It never reads, prints, stores, or forwards the OTP or the email body.

const DEFAULT_PATH = "/auth/otp/request";
const DEFAULT_TIMEOUT_MS = 15000;

function usage() {
  console.log(`Usage:
  node scripts/otp-deliverability-check.js --base-url <https://host> [options]

Options:
  --base-url <url>       Required. HTTPS staging host, or localhost.
  --path <path>          OTP request path. Default: ${DEFAULT_PATH}
  --email <address>      Synthetic test inbox. Repeat for each inbox.
  --field <name>         JSON field for the address. Default: email
  --burst <n>            Requests per inbox. Default: 1
  --timeout-ms <n>       Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --help                 Show this help.

The script prints target index, status, latency, request id, retry-after and
error code only. It never prints the response body, OTP, or email address.`);
}

function parseArgs(argv) {
  const args = {
    path: DEFAULT_PATH,
    field: "email",
    emails: [],
    burst: 1,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    if (arg === "--base-url") args.baseUrl = next();
    else if (arg === "--path") args.path = next();
    else if (arg === "--email") args.emails.push(next());
    else if (arg === "--field") args.field = next();
    else if (arg === "--burst") args.burst = Number(next());
    else if (arg === "--timeout-ms") args.timeoutMs = Number(next());
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.help) {
    if (!args.baseUrl) throw new Error("--base-url is required");
    if (!args.emails.length) throw new Error("At least one --email is required");
    if (!Number.isInteger(args.burst) || args.burst < 1 || args.burst > 20) {
      throw new Error("--burst must be an integer from 1 to 20");
    }
    if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000 || args.timeoutMs > 60000) {
      throw new Error("--timeout-ms must be from 1000 to 60000");
    }
  }

  return args;
}

function validateBaseUrl(value) {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new Error("Use HTTPS unless the target is localhost");
  }
  return url.toString().replace(/\/$/, "");
}

async function requestOnce(baseUrl, path, field, email, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-otp-deliverability-check": "d2-28",
      },
      body: JSON.stringify({ [field]: email }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - started;
    const requestId =
      response.headers.get("x-request-id") ||
      response.headers.get("request-id") ||
      "";
    const retryAfter = response.headers.get("retry-after") || "";

    let errorCode = "";
    if (!response.ok) {
      try {
        const body = await response.json();
        errorCode = body?.error?.code || body?.code || "";
      } catch {
        // Intentionally ignore the body. It may contain user data.
      }
    }

    return {
      status: response.status,
      latencyMs,
      requestId,
      retryAfter,
      errorCode,
    };
  } catch (error) {
    return {
      status: 0,
      latencyMs: Date.now() - started,
      errorCode: error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return 0;
  }

  const baseUrl = validateBaseUrl(args.baseUrl);
  let failures = 0;

  console.log(`D2-28 OTP request check: ${args.emails.length} target(s), burst ${args.burst}`);
  console.log("No OTP, response body, or email address will be printed.");

  for (let target = 0; target < args.emails.length; target += 1) {
    for (let attempt = 1; attempt <= args.burst; attempt += 1) {
      const result = await requestOnce(
        baseUrl,
        args.path,
        args.field,
        args.emails[target],
        args.timeoutMs
      );

      const details = [
        `target=${target + 1}`,
        `attempt=${attempt}`,
        `status=${result.status || "ERR"}`,
        `latencyMs=${result.latencyMs}`,
      ];
      if (result.requestId) details.push(`requestId=${result.requestId}`);
      if (result.retryAfter) details.push(`retryAfter=${result.retryAfter}`);
      if (result.errorCode) details.push(`errorCode=${result.errorCode}`);
      console.log(details.join(" "));

      if (result.status < 200 || result.status >= 300) failures += 1;
    }
  }

  console.log(`Summary: failures=${failures}`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch(() => {
    console.error("OTP check failed: check arguments, target URL, and network access");
    process.exitCode = 2;
  });
