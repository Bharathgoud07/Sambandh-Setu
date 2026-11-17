const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");
const { app } = require("../server");

const PRODUCTION_ORIGIN = "https://sambandh-setu-website.vercel.app";
const STAGING_ORIGIN = "https://setu-app-ten.vercel.app";
const BLOCKED_ORIGIN = "https://not-allowed.example";

let server;
let baseUrl;

const request = (path, headers = {}) =>
    new Promise((resolve, reject) => {
        const req = http.request(`${baseUrl}${path}`, { method: "GET", headers }, (res) => {
            res.resume();
            res.on("end", () => resolve({
                status: res.statusCode,
                allowOrigin: res.headers["access-control-allow-origin"] || null
            }));
        });
        req.on("error", reject);
        req.end();
    });

before(async () => {
    process.env.CORS_ALLOWED_ORIGINS = `${PRODUCTION_ORIGIN}, ${STAGING_ORIGIN}`;
    server = app.listen(0);
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
});

test("the production website origin is allowed", async () => {
    const response = await request("/health/live", { Origin: PRODUCTION_ORIGIN });
    assert.equal(response.status, 200);
    assert.equal(response.allowOrigin, PRODUCTION_ORIGIN);
});

test("the staging web origin is allowed", async () => {
    const response = await request("/health/live", { Origin: STAGING_ORIGIN });
    assert.equal(response.status, 200);
    assert.equal(response.allowOrigin, STAGING_ORIGIN);
});

test("an unknown browser origin is refused", async () => {
    const response = await request("/health/live", { Origin: BLOCKED_ORIGIN });
    assert.equal(response.status, 200);
    assert.equal(response.allowOrigin, null);
});

test("requests without an Origin header still work for native apps", async () => {
    const response = await request("/health/live");
    assert.equal(response.status, 200);
    assert.equal(response.allowOrigin, null);
});
