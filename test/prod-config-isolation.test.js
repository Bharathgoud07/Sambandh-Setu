const test = require("node:test");
const assert = require("node:assert/strict");

const { parseEnv, parseMongo, compareConfigs } = require("../scripts/check-prod-config");

const mongoUri = (user, host) =>
    ["mongodb+srv://", user, ":", "not-a-real-password", "@", host, "/sambandh_setu?retryWrites=true"].join("");

const production = {
    NODE_ENV: "production",
    MONGODB_URI: mongoUri("setu_prod_app", "prod-db.mongodb.net"),
    JWT_SECRET: "p".repeat(48),
    GUIDE_SERVICE_URL: "https://setu-guide-prod.onrender.com",
};

const staging = {
    NODE_ENV: "production",
    MONGODB_URI: mongoUri("setu_staging", "staging-db.mongodb.net"),
    JWT_SECRET: "s".repeat(48),
    GUIDE_SERVICE_URL: "https://setu-guide-1wiy.onrender.com",
};

test("parseEnv ignores comments and handles quoted values", () => {
    const parsed = parseEnv('# comment\nA=1\nB="two words"\nC=\'three\'\n');
    assert.deepEqual(parsed, { A: "1", B: "two words", C: "three" });
});

test("parseMongo extracts user, host and database", () => {
    assert.deepEqual(parseMongo(production.MONGODB_URI), {
        username: "setu_prod_app",
        host: "prod-db.mongodb.net",
        database: "sambandh_setu",
    });
});

test("passes when production secrets and hosts differ from staging", () => {
    const { failures } = compareConfigs(production, staging);
    assert.deepEqual(failures, []);
});

test("fails when production JWT equals staging JWT", () => {
    const { failures } = compareConfigs({ ...production, JWT_SECRET: staging.JWT_SECRET }, staging);
    assert.ok(failures.some((failure) => failure.startsWith("JWT_SECRET: production value equals staging value")));
});

test("fails when production DB host or user equals staging", () => {
    const sameHost = compareConfigs(
        { ...production, MONGODB_URI: production.MONGODB_URI.replace("prod-db", "staging-db") },
        staging
    );
    assert.ok(sameHost.failures.some((failure) => failure.startsWith("MONGODB_URI: production host equals staging host")));

    const sameUser = compareConfigs(
        { ...production, MONGODB_URI: production.MONGODB_URI.replace("setu_prod_app", "setu_staging") },
        staging
    );
    assert.ok(sameUser.failures.some((failure) => failure.startsWith("MONGODB_URI: production DB user equals staging DB user")));
});

test("fails on placeholders, staging markers, short JWT and non-production NODE_ENV", () => {
    const { failures } = compareConfigs(
        {
            ...production,
            JWT_SECRET: "short",
            NODE_ENV: "development",
            GUIDE_SERVICE_URL: "https://REPLACE-WITH-PROD-URL",
            SENTRY_DSN: "https://staging.example.com/1",
        },
        staging
    );
    assert.ok(failures.some((failure) => failure === "JWT_SECRET: shorter than 32 characters"));
    assert.ok(failures.some((failure) => failure === "NODE_ENV: must be production"));
    assert.ok(failures.some((failure) => failure === "GUIDE_SERVICE_URL: placeholder value"));
    assert.ok(failures.some((failure) => failure === "SENTRY_DSN: contains a staging/local marker"));
});

test("fails when required production keys are missing", () => {
    const { failures } = compareConfigs({ NODE_ENV: "production" }, staging);
    assert.ok(failures.includes("MONGODB_URI: missing in production"));
    assert.ok(failures.includes("JWT_SECRET: missing in production"));
    assert.ok(failures.includes("GUIDE_SERVICE_URL: missing in production"));
});
