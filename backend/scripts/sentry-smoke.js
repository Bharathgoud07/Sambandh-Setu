#!/usr/bin/env node
// Sends one synthetic error to Sentry to verify the DSN and the alert channel.
// No-op (exit 0) when SENTRY_DSN is not set.

require("dotenv").config();
const { initSentry, captureException } = require("../config/sentry");

(async () => {
    if (!initSentry()) {
        console.log("SENTRY_DSN is not set; nothing was sent.");
        return;
    }

    const error = new Error("Setu API Sentry smoke test");
    error.code = "SENTRY_SMOKE_TEST";
    captureException(error, { method: "GET", route: { path: "/sentry-smoke" } });

    const sentry = require("@sentry/node");
    await sentry.flush(5000);
    console.log("Smoke event sent. Check Sentry -> Issues and mark it resolved.");
})();
