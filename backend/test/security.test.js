const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");
const { app } = require("../server");

let server;
let baseUrl;

const request = (path) =>
    new Promise((resolve, reject) => {
        const req = http.request(`${baseUrl}${path}`, { method: "GET" }, (res) => {
            res.resume();
            res.on("end", () => resolve({
                status: res.statusCode,
                headers: res.headers
            }));
        });
        req.on("error", reject);
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

test("Helmet adds baseline security headers", async () => {
    const response = await request("/health/live");

    assert.equal(response.status, 200);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["x-frame-options"], "SAMEORIGIN");
    assert.equal(response.headers["referrer-policy"], "no-referrer");
    assert.equal(response.headers["cross-origin-resource-policy"], "cross-origin");
    assert.match(response.headers["strict-transport-security"] || "", /max-age=/);
    assert.ok(response.headers["content-security-policy"]);
});
