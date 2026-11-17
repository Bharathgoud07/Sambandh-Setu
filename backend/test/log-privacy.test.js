/**
 * D2-24 - log privacy regression test.
 *
 * Proves two things:
 *   1. Requests carrying synthetic PAN / Aadhaar / OTP / phone / email never
 *      put those values into the logs or into the error response.
 *   2. No source file logs raw error messages or request objects.
 *
 * The markers below are fake and only used inside this test.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const util = require("node:util");
const { after, before, test } = require("node:test");

const { app } = require("../server");
const { errorHandler } = require("../middleware/errorMiddleware");

const MARKERS = [
    "ABCDE1234F",                 // synthetic PAN
    "1234 5678 9012",             // synthetic Aadhaar
    "483920",                     // synthetic OTP
    "+919876543210",              // synthetic phone
    "privacy.marker@example.test" // synthetic email
];

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
});

const request = (pathname, { method = "GET", raw } = {}) =>
    new Promise((resolve, reject) => {
        const req = http.request(
            `${baseUrl}${pathname}`,
            {
                method,
                headers: raw ? { "content-type": "application/json" } : {}
            },
            (res) => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    body += chunk;
                });
                res.on("end", () => resolve({ status: res.statusCode, body }));
            }
        );
        req.on("error", reject);
        if (raw) {
            req.write(raw);
        }
        req.end();
    });

async function captureConsole(run) {
    const lines = [];
    const original = {};
    for (const level of ["log", "info", "warn", "error", "debug"]) {
        original[level] = console[level];
        console[level] = (...args) => {
            lines.push(util.format(...args));
        };
    }
    try {
        await run();
    } finally {
        Object.assign(console, original);
    }
    return lines.join("\n");
}

function assertNoMarkers(text, label) {
    for (const marker of MARKERS) {
        assert.ok(!text.includes(marker), `${label} leaked ${marker}`);
    }
}

test("a rejected request body is never echoed into the logs", async () => {
    // Deliberately invalid JSON, so express hands it to the error middleware.
    const raw = `{"pan":"${MARKERS[0]}","aadhaar":"${MARKERS[1]}","otp":"${MARKERS[2]}"`;

    const logs = await captureConsole(async () => {
        const res = await request("/auth/register", { method: "POST", raw });
        assert.equal(res.status, 400);
        assertNoMarkers(res.body, "response body");
    });

    assertNoMarkers(logs, "logs");
});

test("a 404 with PII in the query string is not logged", async () => {
    const logs = await captureConsole(async () => {
        const res = await request(
            `/does-not-exist?email=${encodeURIComponent(MARKERS[4])}&otp=${MARKERS[2]}`
        );
        assert.equal(res.status, 404);
    });

    assertNoMarkers(logs, "logs");
});

test("unhandled errors log type, code and route only", async () => {
    const error = new Error(
        `PAN ${MARKERS[0]} Aadhaar ${MARKERS[1]} OTP ${MARKERS[2]} email ${MARKERS[4]}`
    );
    error.name = "SyntheticError";
    error.code = "SYNTHETIC_FAILURE";

    const req = { method: "POST", path: "/profiles", route: { path: "/profiles" } };
    let status;
    let payload;
    const res = {
        headersSent: false,
        status(code) {
            status = code;
            return this;
        },
        json(body) {
            payload = body;
            return this;
        }
    };

    const logs = await captureConsole(async () => {
        errorHandler(error, req, res, () => {});
    });

    assert.equal(status, 500);
    assert.equal(payload.error.code, "INTERNAL_SERVER_ERROR");
    assert.equal(payload.error.message, "An unexpected error occurred");
    assert.ok(logs.includes("name=SyntheticError"), "error type should be logged");
    assert.ok(logs.includes("code=SYNTHETIC_FAILURE"), "error code should be logged");
    assert.ok(logs.includes("route=/profiles"), "matched route should be logged");
    assertNoMarkers(logs, "logs");
});

const SOURCE_DIRS = ["config", "controllers", "middleware", "models", "routes", "seed", "scripts", "utils"];

function listJsFiles(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === "test") {
                continue;
            }
            files.push(...listJsFiles(full));
        } else if (entry.name.endsWith(".js")) {
            files.push(full);
        }
    }
    return files;
}

test("no source file logs raw error messages or request objects", () => {
    const root = path.join(__dirname, "..");
    const files = [
        path.join(root, "server.js"),
        path.join(root, "test-db.js"),
        ...SOURCE_DIRS
            .filter((dir) => fs.existsSync(path.join(root, dir)))
            .flatMap((dir) => listJsFiles(path.join(root, dir)))
    ].filter((file) => fs.existsSync(file));

    const patterns = [
        {
            name: "raw error message inside a console call",
            regex: /console\.\w+\s*\([\s\S]{0,400}?\b(?:error|err|e|disconnectError|cause)\.message\b/
        },
        {
            name: "request body inside a console call",
            regex: /console\.\w+\s*\([\s\S]{0,400}?\breq\.body\b/
        },
        {
            name: "request query inside a console call",
            regex: /console\.\w+\s*\([\s\S]{0,400}?\breq\.query\b/
        },
        {
            name: "request params inside a console call",
            regex: /console\.\w+\s*\([\s\S]{0,400}?\breq\.params\b/
        },
        {
            name: "request JSON inside a console call",
            regex: /console\.\w+\s*\([\s\S]{0,400}?JSON\.stringify\(\s*req\b/
        }
    ];

    const violations = [];
    for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        for (const pattern of patterns) {
            if (pattern.regex.test(source)) {
                violations.push(`${path.relative(root, file)}: ${pattern.name}`);
            }
        }
    }

    assert.deepEqual(violations, []);
});
