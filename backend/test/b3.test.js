const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");
const {
    validatePreferenceObject,
    validateProfilePatch
} = require("../controllers/profileController");
const { app } = require("../server");

let server;
let baseUrl;

const request = (path, { method = "GET", body, headers = {} } = {}) =>
    new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const req = http.request(
            `${baseUrl}${path}`,
            {
                method,
                headers: {
                    ...(payload ? { "content-type": "application/json" } : {}),
                    ...headers
                }
            },
            (res) => {
                let responseBody = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    responseBody += chunk;
                });
                res.on("end", () => {
                    resolve({
                        status: res.statusCode,
                        body: responseBody ? JSON.parse(responseBody) : null
                    });
                });
            }
        );
        req.on("error", reject);
        if (payload) {
            req.write(payload);
        }
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

test("B3 protected endpoints require authentication", async () => {
    const endpoints = [
        ["/chats"],
        ["/chats/507f1f77bcf86cd799439011/messages"],
        ["/chats/507f1f77bcf86cd799439011/messages", { method: "POST", body: { text: "hello" } }],
        ["/chats/507f1f77bcf86cd799439011/read", { method: "POST" }],
        ["/chats/507f1f77bcf86cd799439011/mute", { method: "PUT", body: { muted: true } }],
        ["/me/profile", { method: "PATCH", body: { bio: "Updated" } }],
        ["/me/preferences/basic"],
        ["/me/preferences/basic", { method: "PATCH", body: { values: ["shared"] } }]
    ];

    for (const [path, options] of endpoints) {
        const response = await request(path, options);
        assert.equal(response.status, 401, path);
        assert.equal(response.body.error.code, "UNAUTHORIZED", path);
    }
});

test("health endpoints distinguish liveness from database readiness", async () => {
    const live = await request("/health/live");
    const ready = await request("/health/ready");
    assert.equal(live.status, 200);
    assert.equal(live.body.data.status, "ok");
    assert.ok([200, 503].includes(ready.status));
    if (ready.status === 200) {
        assert.equal(ready.body.data.status, "ready");
    } else {
        assert.equal(ready.body.error.code, "NOT_READY");
    }
});

test("profile updates allow only validated editable fields", () => {
    assert.deepEqual(validateProfilePatch({ age: 29, bio: " Updated " }), {
        age: 29,
        bio: "Updated"
    });
    assert.deepEqual(validateProfilePatch({ lifestyle: { interests: ["reading"] } }), {
        lifestyle: { interests: ["reading"] }
    });
    assert.throws(() => validateProfilePatch({ user: "another-user" }), {
        code: "VALIDATION_ERROR"
    });
    assert.throws(() => validateProfilePatch({ age: 17 }), { code: "VALIDATION_ERROR" });
    assert.throws(() => validateProfilePatch({ interests: [""] }), {
        code: "VALIDATION_ERROR"
    });
});

test("preference updates accept bounded JSON objects and reject unsafe keys or values", () => {
    assert.deepEqual(validatePreferenceObject({ pace: "slow", topics: ["family"] }, "basic"), {
        pace: "slow",
        topics: ["family"]
    });
    assert.throws(() => validatePreferenceObject({ "$where": "1 == 1" }, "basic"), {
        code: "VALIDATION_ERROR"
    });
    assert.throws(() => validatePreferenceObject({ "nested.key": true }, "basic"), {
        code: "VALIDATION_ERROR"
    });
    assert.throws(() => validatePreferenceObject({ count: Number.NaN }, "basic"), {
        code: "VALIDATION_ERROR"
    });
});
