#!/usr/bin/env node
"use strict";

// Production/staging isolation guard (D3-11).
//
// Compares two .env-style files and fails when production reuses a staging
// value, still contains a placeholder, or points at the staging database.
// It never prints values - only key names and reasons.

const fs = require("fs");

const SENSITIVE_KEYS = [
    "JWT_SECRET",
    "MONGODB_URI",
    "GUIDE_SERVICE_URL",
    "SENTRY_DSN",
    "LLM_API_KEY",
    "INTERNAL_API_KEY",
    "CORS_ORIGINS",
    "EXPO_PUBLIC_API_URL",
];

const REQUIRED_PROD_KEYS = ["NODE_ENV", "MONGODB_URI", "JWT_SECRET", "GUIDE_SERVICE_URL"];

const PLACEHOLDER_PATTERNS = [
    /replace[-_ ]?with/i,
    /changeme/i,
    /^<.*>$/i,
    /example\.com/i,
];

const STAGING_MARKERS = [/staging/i, /setu-staging/i, /localhost/i, /127\.0\.0\.1/i];

const parseEnv = (text) => {
    const out = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const eq = line.indexOf("=");
        if (eq <= 0) {
            continue;
        }
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
};

const parseMongo = (uri) => {
    // mongodb(+srv)://user:password@host/database?options
    const match = /^mongodb(?:\+srv)?:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]*)/.exec(uri || "");
    if (!match) {
        return null;
    }
    return {
        username: decodeURIComponent(match[1]),
        host: match[3],
        database: match[4],
    };
};

const compareConfigs = (prod, staging) => {
    const failures = [];
    const notes = [];

    for (const key of REQUIRED_PROD_KEYS) {
        if (!prod[key]) {
            failures.push(`${key}: missing in production`);
        }
    }

    for (const key of SENSITIVE_KEYS) {
        if (prod[key] && staging[key] && prod[key] === staging[key]) {
            failures.push(`${key}: production value equals staging value`);
        }
    }

    for (const [key, value] of Object.entries(prod)) {
        if (!value) {
            continue;
        }
        if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) {
            failures.push(`${key}: placeholder value`);
        }
        if (STAGING_MARKERS.some((pattern) => pattern.test(value))) {
            failures.push(`${key}: contains a staging/local marker`);
        }
    }

    const prodMongo = parseMongo(prod.MONGODB_URI);
    const stagingMongo = parseMongo(staging.MONGODB_URI);
    if (!prodMongo) {
        failures.push("MONGODB_URI: not a valid mongodb connection string");
    } else {
        if (!prodMongo.host.endsWith(".mongodb.net")) {
            failures.push("MONGODB_URI: production host is not an Atlas host");
        }
        if (prodMongo.database !== "sambandh_setu") {
            notes.push(`MONGODB_URI: database is "${prodMongo.database}" (expected sambandh_setu)`);
        }
        if (stagingMongo && prodMongo.host === stagingMongo.host) {
            failures.push("MONGODB_URI: production host equals staging host");
        }
        if (stagingMongo && prodMongo.username === stagingMongo.username) {
            failures.push("MONGODB_URI: production DB user equals staging DB user");
        }
    }

    if (prod.JWT_SECRET && prod.JWT_SECRET.length < 32) {
        failures.push("JWT_SECRET: shorter than 32 characters");
    }
    if (prod.NODE_ENV !== "production") {
        failures.push("NODE_ENV: must be production");
    }

    return { failures, notes };
};

const main = () => {
    const args = process.argv.slice(2);
    const valueOf = (flag) => {
        const index = args.indexOf(flag);
        return index >= 0 ? args[index + 1] : undefined;
    };

    const prodPath = valueOf("--prod");
    const stagingPath = valueOf("--staging");
    if (!prodPath || !stagingPath) {
        console.error("usage: node scripts/check-prod-config.js --prod <prod.env> --staging <staging.env>");
        process.exit(2);
    }

    const prod = parseEnv(fs.readFileSync(prodPath, "utf8"));
    const staging = parseEnv(fs.readFileSync(stagingPath, "utf8"));
    const { failures, notes } = compareConfigs(prod, staging);

    for (const note of notes) {
        console.log(`NOTE ${note}`);
    }
    if (failures.length > 0) {
        for (const failure of failures) {
            console.error(`FAIL ${failure}`);
        }
        console.error(`production isolation check failed (${failures.length} issue(s))`);
        process.exit(1);
    }
    console.log("PASS production config is isolated from staging");
};

if (require.main === module) {
    main();
}

module.exports = { parseEnv, parseMongo, compareConfigs };
