require("dotenv").config();

const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");
const mongoose = require("mongoose");
const Connection = require("../models/Connection");
const ConnectionRequest = require("../models/ConnectionRequest");
const Notification = require("../models/Notification");
const User = require("../models/User");
const connectDB = require("../config/db");
const { app } = require("../server");

const seededUsernames = [
    "aanya",
    "rohan",
    "karthik",
    "arjun",
    "varun",
    "siddharth",
    "aditya",
    "sai-kiran",
    "nikhil"
];

let server;
let baseUrl;
let requestId;
let connectionId;
let aanyaId;
let rohanId;
let pairKey;

const apiRequest = (path, { method = "GET", token, body } = {}) =>
    new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const request = http.request(
            `${baseUrl}${path}`,
            {
                method,
                headers: {
                    ...(payload ? { "content-type": "application/json" } : {}),
                    ...(token ? { authorization: `Bearer ${token}` } : {})
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
                            body: responseBody ? JSON.parse(responseBody) : null
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );
        request.on("error", reject);
        if (payload) {
            request.write(payload);
        }
        request.end();
    });

before(async () => {
    assert.equal(
        process.env.NODE_ENV,
        "development",
        "Set NODE_ENV=development to enable the seeded-user login endpoint"
    );
    assert.ok(
        process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32,
        "JWT_SECRET must be configured"
    );

    await connectDB();

    const seededUsers = await User.find({
        username: { $in: seededUsernames },
        isSeeded: true
    })
        .select("_id username")
        .lean();
    assert.equal(seededUsers.length, 9, "All nine fictional users must be seeded");

    const aanya = seededUsers.find((user) => user.username === "aanya");
    const rohan = seededUsers.find((user) => user.username === "rohan");
    assert.ok(aanya && rohan, "Aanya and Rohan must be seeded");
    pairKey = [String(aanya._id), String(rohan._id)].sort().join(":");

    const [existingConnection, existingPendingRequest] = await Promise.all([
        Connection.exists({ pairKey, status: "active" }),
        ConnectionRequest.exists({ pairKey, status: "pending" })
    ]);
    assert.equal(existingConnection, null, "Aanya and Rohan must not already be connected");
    assert.equal(existingPendingRequest, null, "Aanya and Rohan must not have a pending request");

    server = app.listen(0);
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (mongoose.connection.readyState === 1) {
        if (requestId) {
            await Notification.deleteMany({ request: requestId });
            await Connection.deleteMany({ request: requestId });
            await ConnectionRequest.deleteOne({ _id: requestId });
        }
        if (connectionId) {
            await Notification.deleteMany({ connection: connectionId });
            await Connection.deleteOne({ _id: connectionId });
        }
        if (server?.listening) {
            await new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
        await mongoose.disconnect();
    }
});

test("B1 MongoDB integration: seeded-user request and connection lifecycle", async (t) => {
    let aanyaToken;
    let rohanToken;
    let karthikToken;
    let requestNotificationId;

    await t.test("Aanya and Rohan can log in and receive JWTs", async () => {
        const aanyaLogin = await apiRequest("/auth/dev-login", {
            method: "POST",
            body: { username: "aanya" }
        });
        assert.equal(aanyaLogin.status, 200);
        assert.equal(aanyaLogin.body.data.user.username, "aanya");
        assert.ok(typeof aanyaLogin.body.data.token === "string");
        assert.equal(Object.hasOwn(aanyaLogin.body.data.user, "passwordHash"), false);
        assert.equal(Object.hasOwn(aanyaLogin.body.data.user, "email"), false);
        aanyaToken = aanyaLogin.body.data.token;
        aanyaId = aanyaLogin.body.data.user.id;

        const rohanLogin = await apiRequest("/auth/dev-login", {
            method: "POST",
            body: { username: "rohan" }
        });
        assert.equal(rohanLogin.status, 200);
        assert.equal(rohanLogin.body.data.user.username, "rohan");
        assert.ok(typeof rohanLogin.body.data.token === "string");
        rohanToken = rohanLogin.body.data.token;
        rohanId = rohanLogin.body.data.user.id;

        const karthikLogin = await apiRequest("/auth/dev-login", {
            method: "POST",
            body: { username: "karthik" }
        });
        assert.equal(karthikLogin.status, 200);
        karthikToken = karthikLogin.body.data.token;
    });

    await t.test("unauthenticated requests return 401", async () => {
        const response = await apiRequest("/me");
        assert.equal(response.status, 401);
        assert.equal(response.body.error.code, "UNAUTHORIZED");
    });

    await t.test("Aanya can view her profile and discover Rohan", async () => {
        const [me, profile, discover] = await Promise.all([
            apiRequest("/me", { token: aanyaToken }),
            apiRequest("/me/profile", { token: aanyaToken }),
            apiRequest("/discover", { token: aanyaToken })
        ]);
        assert.equal(me.status, 200);
        assert.equal(me.body.data.user.id, aanyaId);
        assert.equal(Object.hasOwn(me.body.data.user, "passwordHash"), false);
        assert.equal(profile.status, 200);
        assert.equal(profile.body.data.profile.user.id, aanyaId);
        assert.equal(Object.hasOwn(profile.body.data.profile, "passwordHash"), false);
        assert.ok(
            discover.body.data.users.some((userProfile) => userProfile.user.id === rohanId),
            "Rohan should appear in Aanya's discover list before she sends a request"
        );
    });

    await t.test("Aanya can send a request and Rohan can view it", async () => {
        const sent = await apiRequest("/requests", {
            method: "POST",
            token: aanyaToken,
            body: { recipientId: rohanId }
        });
        assert.equal(sent.status, 201);
        assert.equal(sent.body.data.request.sender.id, aanyaId);
        assert.equal(sent.body.data.request.recipient.username, "rohan");
        requestId = sent.body.data.request.id;

        const received = await apiRequest("/requests?box=received", { token: rohanToken });
        assert.equal(received.status, 200);
        assert.ok(received.body.data.requests.some((request) => request.id === requestId));

        const rohanNotifications = await apiRequest("/notifications", { token: rohanToken });
        const requestNotification = rohanNotifications.body.data.notifications.find(
            (notification) =>
                notification.type === "connection_request" &&
                notification.requestId === requestId
        );
        assert.ok(requestNotification, "Rohan should receive a connection-request notification");
        requestNotificationId = requestNotification.id;
    });

    await t.test("only the notification owner can read the connection-request notification", async () => {
        const response = await apiRequest(`/notifications/${requestNotificationId}/read`, {
            method: "POST",
            token: aanyaToken
        });
        assert.equal(response.status, 403);
        assert.equal(response.body.error.code, "FORBIDDEN");
    });

    await t.test("Rohan can accept; the resulting connection starts at Connect", async () => {
        const accepted = await apiRequest(`/requests/${requestId}/accept`, {
            method: "POST",
            token: rohanToken
        });
        assert.equal(accepted.status, 200);
        assert.equal(accepted.body.data.request.status, "accepted");
        assert.equal(accepted.body.data.connection.status, "active");
        assert.equal(accepted.body.data.connection.stage, "connect");
        connectionId = accepted.body.data.connection.id;
    });

    await t.test("both participants can see the active connection", async () => {
        for (const token of [aanyaToken, rohanToken]) {
            const response = await apiRequest("/connections?status=active", { token });
            assert.equal(response.status, 200);
            const connection = response.body.data.connections.find(
                (item) => item.id === connectionId
            );
            assert.ok(connection);
            assert.equal(connection.status, "active");
            assert.equal(connection.stage, "connect");
            assert.equal(connection.participants.length, 2);
        }
    });

    await t.test("a third seeded user cannot read the private connection", async () => {
        const response = await apiRequest(`/connections/${connectionId}`, {
            token: karthikToken
        });
        assert.equal(response.status, 403);
        assert.equal(response.body.error.code, "FORBIDDEN");
    });

    await t.test("request and acceptance notifications reach the affected users", async () => {
        const [rohanNotifications, aanyaNotifications] = await Promise.all([
            apiRequest("/notifications", { token: rohanToken }),
            apiRequest("/notifications", { token: aanyaToken })
        ]);
        assert.ok(
            rohanNotifications.body.data.notifications.some(
                (notification) =>
                    notification.type === "connection_request" &&
                    notification.requestId === requestId
            )
        );
        assert.ok(
            aanyaNotifications.body.data.notifications.some(
                (notification) =>
                    notification.type === "connection_accepted" &&
                    notification.requestId === requestId &&
                    notification.connectionId === connectionId
            )
        );
    });
});
