
require("dotenv").config();

const assert = require("node:assert/strict");
const http = require("node:http");
const { before, after, test } = require("node:test");
const mongoose = require("mongoose");

const Otp = require("../models/Otp");
const User = require("../models/User");
const connectDB = require("../config/db");

const mailer = require("../services/mailer");

let capturedOtp = null;
let capturedEmail = null;

// Test-only email mock
mailer.sendOtpEmail = async (to, code) => {
    capturedEmail = to;
    capturedOtp = code;
};

const { app } = require("../server");

let server;
let baseUrl;

const testEmail = `otp-test-${Date.now()}@example.com`;

const apiRequest = (path, { method = "GET", body } = {}) =>
    new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);

        const request = http.request(
            `${baseUrl}${path}`,
            {
                method,
                headers: payload
                    ? { "content-type": "application/json" }
                    : {}
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
                            body: responseBody ? JSON.parse(responseBody) : null
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        request.on("error", reject);
        if (payload) request.write(payload);
        request.end();
    });

before(async () => {
    assert.ok(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32);
    assert.ok(process.env.OTP_HMAC_SECRET && process.env.OTP_HMAC_SECRET.length >= 32);

    await connectDB();

    await Otp.deleteMany({ email: testEmail });
    await User.deleteMany({ email: testEmail });

    server = app.listen(0);

    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (mongoose.connection.readyState === 1) {
        await Otp.deleteMany({ email: testEmail });
        await User.deleteMany({ email: testEmail });

        if (server?.listening) {
            await new Promise((resolve, reject) => {
                server.close((error) => error ? reject(error) : resolve());
            });
        }

        await mongoose.disconnect();
    }
});

test("OTP authentication integration", async (t) => {
    await t.test("OTP request returns the agreed response", async () => {
        capturedOtp = null;
        capturedEmail = null;

        const response = await apiRequest("/auth/otp/request", {
            method: "POST",
            body: { email: testEmail }
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.expiresInSeconds, 600);
        assert.equal(response.body.resendAfterSeconds, 30);
        assert.equal(capturedEmail, testEmail);
        assert.match(capturedOtp, /^\d{6}$/);
    });

    await t.test("OTP is stored as a hash, not plaintext", async () => {
        const record = await Otp.findOne({ email: testEmail }).select("+codeHash");

        assert.ok(record);
        assert.notEqual(record.codeHash, capturedOtp);
        assert.match(record.codeHash, /^[a-f0-9]{64}$/);
        assert.equal(record.attempts, 0);
    });

    await t.test("wrong OTP is rejected", async () => {
        const wrongCode = capturedOtp === "000000" ? "000001" : "000000";

        const response = await apiRequest("/auth/otp/verify", {
            method: "POST",
            body: { email: testEmail, code: wrongCode }
        });

        assert.equal(response.status, 400);
        assert.equal(response.body.error.code, "INVALID_OTP");
    });

    await t.test("correct OTP creates a new user and returns JWT", async () => {
        const response = await apiRequest("/auth/otp/verify", {
            method: "POST",
            body: { email: testEmail, code: capturedOtp }
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.isNewUser, true);
        assert.equal(response.body.user.onboardingCompleted, false);
        assert.ok(typeof response.body.token === "string");

        const user = await User.findOne({ email: testEmail }).select("+email");

        assert.ok(user);
        assert.equal(user.onboardingCompleted, false);

        const otpRecord = await Otp.findOne({ email: testEmail });
        assert.equal(otpRecord, null);
    });

    await t.test("OTP cannot be reused", async () => {
        const response = await apiRequest("/auth/otp/verify", {
            method: "POST",
            body: { email: testEmail, code: capturedOtp }
        });

        assert.equal(response.status, 400);
       assert.equal(response.body.error.code, "INVALID_OTP");
    });
});

