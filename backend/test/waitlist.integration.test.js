
require("dotenv").config();

const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, afterEach, test } = require("node:test");
const mongoose = require("mongoose");

const Waitlist = require("../models/Waitlist");
const waitlistRateLimit = require("../middleware/waitlistRateLimit");
const connectDB = require("../config/db");
const { app } = require("../server");

const uniqueSuffix = `${process.pid}-${Date.now()}`;

const testEmails = [
    `valid-${uniqueSuffix}@example.com`,
    `duplicate-${uniqueSuffix}@example.com`,
    `invalid-${uniqueSuffix}@example.com`,
    `consent-${uniqueSuffix}@example.com`,
    `bot-${uniqueSuffix}@example.com`,
    `duplicate-${uniqueSuffix}@example.com`
];

let server;
let baseUrl;

const apiRequest = (path, body) =>
    new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);

        const request = http.request(
            `${baseUrl}${path}`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json"
                }
            },
            (response) => {
                let responseBody = "";

                response.setEncoding("utf8");
                response.on("data", (chunk) => {
                    responseBody += chunk;
                });

                response.on("end", () => {
                    try {
                        resolve({
                            status: response.statusCode,
                            body: JSON.parse(responseBody)
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        request.on("error", reject);
        request.write(payload);
        request.end();
    });
afterEach(() => {
    waitlistRateLimit.resetKey("127.0.0.1");
    waitlistRateLimit.resetKey("::ffff:127.0.0.1");
});

before(async () => {
    assert.equal(
        process.env.NODE_ENV,
        "development",
        "Waitlist integration tests must run in development"
    );

    await connectDB();
    await Waitlist.init();

    server = app.listen(0);

    await new Promise((resolve) => server.once("listening", resolve));

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    try {
        await Waitlist.deleteMany({
            email: { $in: testEmails }
        });
    } finally {
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }

        await mongoose.disconnect();
    }
});

test("POST /waitlist creates a valid signup", async () => {
    const response = await apiRequest("/waitlist", {
        email: testEmails[0],
        name: "Test User",
        city: "Visakhapatnam",
        consent: true,
        website: ""
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.message, "You're on the list");

    const record = await Waitlist.findOne({
        email: testEmails[0]
    });

    assert.ok(record);
    assert.equal(record.name, "Test User");
    assert.equal(record.city, "Visakhapatnam");
    assert.equal(record.consent, true);
});

test("POST /waitlist returns the same success for duplicate emails", async () => {
    const email = `DUPLICATE-${uniqueSuffix}@EXAMPLE.COM`;

    const first = await apiRequest("/waitlist", {
        email,
        name: "First User",
        consent: true,
        website: ""
    });

    const second = await apiRequest("/waitlist", {
        email: email.toLowerCase(),
        name: "Second User",
        consent: true,
        website: ""
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(first.body, second.body);

    const count = await Waitlist.countDocuments({
        email: email.toLowerCase()
    });

    assert.equal(count, 1);
});

test("POST /waitlist rejects an invalid email", async () => {
    const response = await apiRequest("/waitlist", {
        email: "invalid-email",
        name: "Test User",
        consent: true,
        website: ""
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");

    assert.ok(
        response.body.error.details.some(
            (detail) => detail.field === "email"
        )
    );
});

test("POST /waitlist rejects missing consent", async () => {
    const response = await apiRequest("/waitlist", {
        email: testEmails[3],
        name: "Test User",
        website: ""
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");

    assert.ok(
        response.body.error.details.some(
            (detail) => detail.field === "consent"
        )
    );
});

test("POST /waitlist silently accepts a filled honeypot without saving", async () => {
    const response = await apiRequest("/waitlist", {
        email: testEmails[4],
        name: "Bot User",
        consent: true,
        website: "https://spam.example.com"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.message, "You're on the list");

    const record = await Waitlist.findOne({
        email: testEmails[4]
    });

    assert.equal(record, null);
});


test("POST /waitlist rejects unknown extra fields", async () => {
    const response = await apiRequest("/waitlist", {
        email: `unknown-${uniqueSuffix}@example.com`,
        name: "Test User",
        consent: true,
        website: "",
        extraField: "not allowed"
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");

    assert.ok(
        response.body.error.details.some(
            (detail) => detail.field === "extraField"
        )
    );
});

test("POST /waitlist rejects names shorter than 2 characters", async () => {
    const response = await apiRequest("/waitlist", {
        email: `short-name-${uniqueSuffix}@example.com`,
        name: "A",
        consent: true,
        website: ""
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("POST /waitlist rejects cities longer than 80 characters", async () => {
    const response = await apiRequest("/waitlist", {
        email: `long-city-${uniqueSuffix}@example.com`,
        name: "Test User",
        city: "A".repeat(81),
        consent: true,
        website: ""
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("POST /waitlist trims name and city and lowercases email", async () => {
    const email = `  NORMALIZE-${uniqueSuffix}@EXAMPLE.COM  `;

    const response = await apiRequest("/waitlist", {
        email,
        name: "  Test User  ",
        city: "  Vizag  ",
        consent: true,
        website: ""
    });

    assert.equal(response.status, 200);

    const record = await Waitlist.findOne({
        email: `normalize-${uniqueSuffix}@example.com`
    });

    assert.ok(record);
    assert.equal(record.name, "Test User");
    assert.equal(record.city, "Vizag");
});


test("POST /waitlist rejects names longer than 80 characters", async () => {
    const response = await apiRequest("/waitlist", {
        email: `long-name-${uniqueSuffix}@example.com`,
        name: "A".repeat(81),
        consent: true,
        website: ""
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("POST /waitlist rejects emails longer than 254 characters", async () => {
    const longEmail = `${"a".repeat(243)}@example.com`;

    assert.equal(longEmail.length, 255);

    const response = await apiRequest("/waitlist", {
        email: longEmail,
        name: "Test User",
        consent: true,
        website: ""
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");

    assert.ok(
        response.body.error.details.some(
            (detail) => detail.field === "email"
        )
    );
});
test("POST /waitlist reports all invalid fields together", async () => {
    const response = await apiRequest("/waitlist", {
        email: "bad-email",
        name: "A",
        consent: false,
        extraField: "not allowed",
        website: ""
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");

    const invalidFields = response.body.error.details.map(
        (detail) => detail.field
    );

    assert.deepEqual(invalidFields, [
        "extraField",
        "email",
        "name",
        "consent"
    ]);
});

test("POST /waitlist rate limits after 5 requests", async () => {
    const responses = [];

    for (let i = 0; i < 6; i++) {
        const response = await apiRequest("/waitlist", {
            email: `ratelimit-${i}-${uniqueSuffix}@example.com`,
            name: "Rate Limit Test",
            consent: true,
            website: "spam-bot"
        });

        responses.push(response);
    }

    // First 5 requests should be accepted.
    for (let i = 0; i < 5; i++) {
        assert.equal(responses[i].status, 200);
    }

    // 6th request should be rate limited.
    assert.equal(responses[5].status, 429);

    assert.equal(
        responses[5].body.message,
        "Too many waitlist submissions. Please try again later."
    );
});