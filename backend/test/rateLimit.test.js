const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { after, before, test } = require("node:test");
const { createRateLimiter, emailKeyGenerator } = require("../middleware/rateLimit");

let server;
let baseUrl;

const app = express();
app.use(express.json());
app.post(
    "/limited",
    createRateLimiter({ windowMs: 60_000, limit: 2 }),
    (req, res) => res.json({ data: { ok: true } })
);

const request = (path, body = {}) =>
    new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request(
            `${baseUrl}${path}`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "content-length": Buffer.byteLength(payload)
                }
            },
            (res) => {
                let responseBody = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    responseBody += chunk;
                });
                res.on("end", () => resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: JSON.parse(responseBody)
                }));
            }
        );
        req.on("error", reject);
        req.write(payload);
        req.end();
    });

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

test("the limiter allows the configured number of requests then returns the contract 429", async () => {
    const first = await request("/limited");
    const second = await request("/limited");
    const third = await request("/limited");

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.deepEqual(Object.keys(third.body), ["error"]);
    assert.equal(third.body.error.code, "RATE_LIMITED");
    assert.ok(Array.isArray(third.body.error.details));
    assert.match(third.headers["retry-after"] || "", /^\d+$/);
});

test("the email key is trimmed, lowercased, and falls back to a normalized IP", () => {
    assert.equal(
        emailKeyGenerator({ body: { email: " Test@Example.COM " }, ip: "1.2.3.4" }),
        "email:test@example.com"
    );
    assert.equal(
        emailKeyGenerator({ body: {}, ip: "2001:db8::1" }),
        "ip:2001:db8::/56"
    );
});
