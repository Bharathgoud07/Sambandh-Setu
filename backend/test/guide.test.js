
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const originalFetch = global.fetch;
const originalUrl = process.env.GUIDE_SERVICE_URL;

const guideServicePath = require.resolve("../services/guideService");

afterEach(() => {
    global.fetch = originalFetch;

    if (originalUrl === undefined) {
        delete process.env.GUIDE_SERVICE_URL;
    } else {
        process.env.GUIDE_SERVICE_URL = originalUrl;
    }

    delete require.cache[guideServicePath];
});

const loadGuideService = () => {
    delete require.cache[guideServicePath];
    return require("../services/guideService");
};

const payload = {
    user_id: "test-user",
    match_id: "test-match",
    stage: "connect",
    intent: "conversation_ideas"
};

const assertGuideUnavailable = async (promise) => {
    await assert.rejects(promise, (error) => {
        assert.equal(error.status, 503);
        assert.equal(error.code, "GUIDE_UNAVAILABLE");
        return true;
    });
};

test("returns GUIDE_UNAVAILABLE when GUIDE_SERVICE_URL is missing", async () => {
    delete process.env.GUIDE_SERVICE_URL;

    const service = loadGuideService();

    await assertGuideUnavailable(service.chat(payload));
});

test("returns Guide response when service succeeds", async () => {
    process.env.GUIDE_SERVICE_URL = "https://guide.example.com";

    const expected = {
        intent: "conversation_ideas",
        reply: "Try discussing your interests.",
        questions: [],
        chips: [],
        sources: [],
        safety: { status: "pass", flags: [] },
        fallback_used: false
    };

    global.fetch = async () => ({
        status: 200,
        ok: true,
        json: async () => expected
    });

    const service = loadGuideService();
    const result = await service.chat(payload);

    assert.deepEqual(result, expected);
});

test("returns GUIDE_UNAVAILABLE on 5xx without retrying", async () => {
    process.env.GUIDE_SERVICE_URL = "https://guide.example.com";

    let calls = 0;

    global.fetch = async () => {
        calls++;
        return { status: 503, ok: false };
    };

    const service = loadGuideService();

    await assertGuideUnavailable(service.chat(payload));
    assert.equal(calls, 1);
});

test("returns GUIDE_UNAVAILABLE on invalid JSON", async () => {
    process.env.GUIDE_SERVICE_URL = "https://guide.example.com";

    global.fetch = async () => ({
        status: 200,
        ok: true,
        json: async () => {
            throw new Error("Invalid JSON");
        }
    });

    const service = loadGuideService();

    await assertGuideUnavailable(service.chat(payload));
});

test("returns GUIDE_UNAVAILABLE on timeout without retrying", async () => {
    process.env.GUIDE_SERVICE_URL = "https://guide.example.com";

    let calls = 0;

    global.fetch = async () => {
        calls++;
        const error = new Error("Request timed out");
        error.name = "TimeoutError";
        throw error;
    };

    const service = loadGuideService();

    await assertGuideUnavailable(service.chat(payload));
    assert.equal(calls, 1);
});

test("retries once on 429 using Retry-After", async () => {
    process.env.GUIDE_SERVICE_URL = "https://guide.example.com";

    let calls = 0;

    const expected = {
        reply: "Try discussing your interests."
    };

    global.fetch = async () => {
        calls++;

        if (calls === 1) {
            return {
                status: 429,
                ok: false,
                headers: {
                    get: (name) => name === "Retry-After" ? "0" : null
                }
            };
        }

        return {
            status: 200,
            ok: true,
            json: async () => expected
        };
    };

    const service = loadGuideService();
    const result = await service.chat(payload);

    assert.equal(calls, 2);
    assert.deepEqual(result, expected);
});
