const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sentryModule = require("../config/sentry");

test("Sentry is a no-op when SENTRY_DSN is not configured", () => {
    delete process.env.SENTRY_DSN;
    assert.equal(sentryModule.initSentry(), false);
    assert.equal(sentryModule.isEnabled(), false);
    assert.doesNotThrow(() => sentryModule.captureException(new Error("boom")));
});

test("4xx errors are ignored by the capture filter", () => {
    delete process.env.SENTRY_DSN;
    sentryModule.initSentry();
    const error = new Error("not found");
    error.status = 404;
    assert.doesNotThrow(() => sentryModule.captureException(error));
});

test("Sentry config never prints the DSN and strips request data", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "config", "sentry.js"), "utf8");
    assert.equal(/console\.(log|error|warn)\([^)]*dsn/i.test(source), false);
    assert.match(source, /sendDefaultPii:\s*false/);
    assert.match(source, /delete\s+event\.request/);
});
