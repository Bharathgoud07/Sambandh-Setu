const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    otpIpRateLimiter,
    otpEmailRateLimiter
} = require("../middleware/rateLimit");

function runMiddleware(middleware, req) {
    let error;
    const headers = {};

    const res = {
        set(name, value) {
            headers[name] = value;
            return this;
        }
    };

    middleware(req, res, (err) => {
        error = err;
    });

    return { error, headers };
}

test("OTP IP limiter allows 20 requests and blocks the 21st", () => {
    const req = {
        ip: `test-ip-${Date.now()}-${Math.random()}`,
        body: {}
    };

    for (let i = 0; i < 20; i++) {
        assert.equal(runMiddleware(otpIpRateLimiter, req).error, undefined);
    }

    const blocked = runMiddleware(otpIpRateLimiter, req);

    assert.equal(blocked.error.status, 429);
    assert.equal(blocked.error.code, "RATE_LIMITED");
    assert.ok(Number(blocked.headers["Retry-After"]) > 0);
});

test("OTP email limiter allows 5 requests and blocks the 6th", () => {
    const email = `test-${Date.now()}-${Math.random()}@example.com`;
    const req = {
        ip: `email-ip-${Date.now()}`,
        body: { email }
    };

    for (let i = 0; i < 5; i++) {
        assert.equal(runMiddleware(otpEmailRateLimiter, req).error, undefined);
    }

    const blocked = runMiddleware(otpEmailRateLimiter, req);

    assert.equal(blocked.error.status, 429);
    assert.equal(blocked.error.code, "RATE_LIMITED");
    assert.ok(Number(blocked.headers["Retry-After"]) > 0);
});

test("OTP email limiter normalizes email casing and spaces", () => {
    const email = `normalized-${Date.now()}@example.com`;

    for (let i = 0; i < 5; i++) {
        const result = runMiddleware(otpEmailRateLimiter, {
            ip: `normalized-ip-${i}-${Date.now()}`,
            body: { email }
        });

        assert.equal(result.error, undefined);
    }

    const blocked = runMiddleware(otpEmailRateLimiter, {
        ip: `normalized-final-${Date.now()}`,
        body: { email: `  ${email.toUpperCase()}  ` }
    });

    assert.equal(blocked.error.status, 429);
    assert.equal(blocked.error.code, "RATE_LIMITED");
});
