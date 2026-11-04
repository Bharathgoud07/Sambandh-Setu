const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");
const User = require("../models/User");
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
                    resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
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
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
});

test("user passwords are bcrypt-hashed and excluded from JSON", async () => {
    const user = new User({
        username: "test-user",
        email: "test-user@example.test",
        firstName: "Test",
        passwordHash: "unhashed-placeholder"
    });
    await user.setPassword("a sufficiently long test password");

    assert.notEqual(user.passwordHash, "a sufficiently long test password");
    assert.equal(await user.comparePassword("a sufficiently long test password"), true);
    assert.equal(Object.hasOwn(user.toJSON(), "passwordHash"), false);
    assert.equal(Object.hasOwn(user.toJSON(), "email"), false);
});

test("protected B1 endpoints reject requests without a session in the contract error shape", async () => {
    const endpoints = [
        ["/me"],
        ["/me/profile"],
        ["/profiles/507f1f77bcf86cd799439011"],
        ["/discover"],
        ["/requests?box=received"],
        ["/connections?status=active"],
        ["/home"],
        ["/notifications"],
        ["/notifications/507f1f77bcf86cd799439011/read", { method: "POST" }]
    ];

    for (const [path, options] of endpoints) {
        const response = await request(path, options);
        assert.equal(response.status, 401, path);
        assert.deepEqual(Object.keys(response.body), ["error"], path);
        assert.equal(response.body.error.code, "UNAUTHORIZED", path);
        assert.ok(Array.isArray(response.body.error.details), path);
    }
});

test("development login is unavailable outside development mode", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
        const response = await request("/auth/dev-login", {
            method: "POST",
            body: { username: "aanya" }
        });
        assert.equal(response.status, 403);
        assert.equal(response.body.error.code, "FORBIDDEN");
    } finally {
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
    }
});
