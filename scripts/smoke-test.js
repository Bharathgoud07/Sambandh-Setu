#!/usr/bin/env node
"use strict";

// Production smoke test (D3-12).
// Cross-platform core used by smoke-test.sh and smoke-test.ps1.
//
// Rules:
// - synthetic data only ("example.invalid", generic smoke messages);
// - never prints a token, password or connection string;
// - exits non-zero if any required check fails.

const DEFAULTS = {
    timeoutMs: 20000,
    maxGuideSeconds: 5,
    rateLimitAttempts: 25,
    rateLimitIntervalMs: 50,
    otpPath: "/auth/send-otp",
    rateLimitPath: "/auth/send-otp",
    guideChatPath: "/guide/chat",
    protectedPaths: ["/me", "/connections", "/chats"],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = (argv) => {
    const options = { ...DEFAULTS };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            i += 1;
            if (i >= argv.length) {
                throw new Error(`${arg} needs a value`);
            }
            return argv[i];
        };
        if (arg === "--base-url") options.baseUrl = next();
        else if (arg === "--guide-url") options.guideUrl = next();
        else if (arg === "--otp-path") options.otpPath = next();
        else if (arg === "--rate-limit-path") options.rateLimitPath = next();
        else if (arg === "--guide-chat-path") options.guideChatPath = next();
        else if (arg === "--protected-paths") options.protectedPaths = next().split(",").map((item) => item.trim()).filter(Boolean);
        else if (arg === "--rate-limit-attempts") options.rateLimitAttempts = Number(next());
        else if (arg === "--max-guide-seconds") options.maxGuideSeconds = Number(next());
        else if (arg === "--timeout-ms") options.timeoutMs = Number(next());
        else if (arg === "--allow-skips") options.allowSkips = true;
        else if (arg === "--help" || arg === "-h") options.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return options;
};

const parseJson = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const errorCode = (text) => {
    const body = parseJson(text);
    return body?.error?.code ?? body?.data?.error?.code ?? null;
};

const http = async (url, options, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
        const response = await fetch(url, { ...options, signal: controller.signal, redirect: "manual" });
        const text = await response.text();
        return { status: response.status, headers: response.headers, text, ms: Date.now() - started };
    } finally {
        clearTimeout(timer);
    }
};

const main = async () => {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(`usage error: ${error.message}`);
        process.exit(2);
    }

    if (options.help) {
        console.log(`usage: node scripts/smoke-test.js --base-url <url> --guide-url <url> [options]

options:
  --otp-path <path>              default ${DEFAULTS.otpPath}
  --rate-limit-path <path>       default ${DEFAULTS.rateLimitPath}
  --guide-chat-path <path>       default ${DEFAULTS.guideChatPath}
  --protected-paths <a,b,c>      default ${DEFAULTS.protectedPaths.join(",")}
  --rate-limit-attempts <n>      default ${DEFAULTS.rateLimitAttempts}
  --max-guide-seconds <n>        default ${DEFAULTS.maxGuideSeconds}
  --timeout-ms <n>               default ${DEFAULTS.timeoutMs}
  --allow-skips                  only for local dry runs; never for production

environment:
  SMOKE_TOKEN    synthetic bearer token for authenticated checks (never printed)
  SMOKE_EMAIL    prefix for synthetic OTP requests (default: smoke)

production run must not use --allow-skips.`);
        return;
    }

    options.baseUrl = options.baseUrl || process.env.SMOKE_BASE_URL;
    options.guideUrl = options.guideUrl || process.env.SMOKE_GUIDE_URL;
    if (!options.baseUrl || !options.guideUrl) {
        console.error("usage: node scripts/smoke-test.js --base-url <url> --guide-url <url>");
        process.exit(2);
    }

    const base = options.baseUrl.replace(/\/$/, "");
    const guide = options.guideUrl.replace(/\/$/, "");
    const results = [];

    const pass = (name, detail) => results.push({ name, status: "PASS", detail });
    const fail = (name, error) => results.push({ name, status: "FAIL", detail: error.message });
    const skip = (name, reason) => results.push({ name, status: "SKIP", detail: reason });

    const run = async (name, check) => {
        try {
            const detail = await check();
            pass(name, detail);
        } catch (error) {
            fail(name, error);
        }
    };

    await run("health 200 + DB ready", async () => {
        const response = await http(`${base}/health`, {}, options.timeoutMs);
        if (response.status !== 200) {
            throw new Error(`GET /health returned ${response.status}`);
        }
        const body = parseJson(response.text);
        const status = body?.data?.status ?? body?.status;
        if (status !== "ready") {
            throw new Error(`GET /health body status=${status ?? "missing"}`);
        }
        return `${response.ms} ms`;
    });

    await run("security headers", async () => {
        const response = await http(`${base}/health`, {}, options.timeoutMs);
        const nosniff = response.headers.get("x-content-type-options") || "";
        const csp = response.headers.get("content-security-policy");
        const frame = response.headers.get("x-frame-options");
        const hsts = response.headers.get("strict-transport-security");
        if (!/nosniff/i.test(nosniff)) {
            throw new Error("missing x-content-type-options: nosniff");
        }
        if (!csp && !frame && !hsts) {
            throw new Error("missing CSP, X-Frame-Options and HSTS");
        }
        return "helmet-style headers present";
    });

    await run("CORS refuses a random origin", async () => {
        const origin = "https://smoke.invalid";
        const simple = await http(`${base}/health`, { headers: { Origin: origin } }, options.timeoutMs);
        const allowSimple = simple.headers.get("access-control-allow-origin");
        if (allowSimple && (allowSimple === "*" || allowSimple === origin)) {
            throw new Error(`GET allows random origin (${allowSimple})`);
        }
        const preflight = await http(
            `${base}/health`,
            {
                method: "OPTIONS",
                headers: {
                    Origin: origin,
                    "Access-Control-Request-Method": "GET",
                },
            },
            options.timeoutMs
        );
        const allowPreflight = preflight.headers.get("access-control-allow-origin");
        if (allowPreflight && (allowPreflight === "*" || allowPreflight === origin)) {
            throw new Error(`OPTIONS allows random origin (${allowPreflight})`);
        }
        return "random origin not echoed";
    });

    await run("auth rate limit returns 429 in error shape", async () => {
        const email = `${process.env.SMOKE_EMAIL || "smoke"}+${Date.now()}@example.invalid`;
        let lastStatus = 0;
        let lastCode = null;
        for (let attempt = 0; attempt < options.rateLimitAttempts; attempt += 1) {
            const response = await http(
                `${base}${options.rateLimitPath}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                },
                options.timeoutMs
            );
            lastStatus = response.status;
            lastCode = errorCode(response.text);
            if (response.status === 429) {
                if (!lastCode) {
                    throw new Error("429 response has no error.code");
                }
                return `429 after ${attempt + 1} requests (code=${lastCode})`;
            }
            if (response.status === 404) {
                throw new Error(`${options.rateLimitPath} returned 404`);
            }
            if (response.status === 403) {
                throw new Error(`${options.rateLimitPath} returned 403`);
            }
            await sleep(options.rateLimitIntervalMs);
        }
        throw new Error(`no 429 after ${options.rateLimitAttempts} requests (last ${lastStatus}, code=${lastCode ?? "none"})`);
    });

    await run("OTP request responds", async () => {
        const email = `${process.env.SMOKE_EMAIL || "smoke"}+${Date.now()}@example.invalid`;
        const response = await http(
            `${base}${options.otpPath}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            },
            options.timeoutMs
        );
        if (![200, 201, 202].includes(response.status)) {
            throw new Error(`${options.otpPath} returned ${response.status} (code=${errorCode(response.text) ?? "none"})`);
        }
        return `status ${response.status}`;
    });

    const token = process.env.SMOKE_TOKEN;
    if (!token) {
        if (options.allowSkips) {
            skip("Node /guide/chat reply or fallback", "SMOKE_TOKEN not set (local dry run)");
        } else {
            fail("Node /guide/chat reply or fallback", new Error("SMOKE_TOKEN is required for production smoke test"));
        }
    } else {
        await run("Node /guide/chat reply or fallback", async () => {
            const response = await http(
                `${base}${options.guideChatPath}`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ message: "Setu production smoke test" }),
                },
                options.timeoutMs
            );
            if (response.status !== 200) {
                throw new Error(`${options.guideChatPath} returned ${response.status} (code=${errorCode(response.text) ?? "none"})`);
            }
            const body = parseJson(response.text);
            const reply = body?.data?.reply ?? body?.reply ?? body?.data?.message ?? body?.message;
            const fallback = body?.data?.fallback ?? body?.fallback;
            if (!reply && fallback !== true) {
                throw new Error("200 response has neither a reply nor fallback=true");
            }
            return fallback === true ? "friendly fallback" : "reply";
        });
    }

    await run(`Guide first call under ${options.maxGuideSeconds}s`, async () => {
        const response = await http(`${guide}/health`, {}, options.timeoutMs);
        if (response.status !== 200) {
            throw new Error(`GET ${guide}/health returned ${response.status}`);
        }
        if (response.ms > options.maxGuideSeconds * 1000) {
            throw new Error(`first call took ${response.ms} ms`);
        }
        return `${response.ms} ms`;
    });

    await run("protected routes refuse unauthenticated access", async () => {
        for (const path of options.protectedPaths) {
            const response = await http(`${base}${path}`, {}, options.timeoutMs);
            if (![401, 403].includes(response.status)) {
                throw new Error(`${path} returned ${response.status}`);
            }
        }
        return options.protectedPaths.join(", ");
    });

    const failures = results.filter((result) => result.status === "FAIL");
    const skips = results.filter((result) => result.status === "SKIP");
    for (const result of results) {
        console.log(`${result.status} ${result.name}${result.detail ? ` (${result.detail})` : ""}`);
    }
    console.log(`summary: ${results.length - failures.length - skips.length} passed, ${failures.length} failed, ${skips.length} skipped`);
    if (failures.length > 0 || skips.length > 0) {
        process.exit(1);
    }
};

main().catch((error) => {
    console.error(`smoke test crashed: ${error.name}`);
    process.exit(1);
});
