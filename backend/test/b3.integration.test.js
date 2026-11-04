require("dotenv").config();

const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");
const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const Connection = require("../models/Connection");
const ConnectionRequest = require("../models/ConnectionRequest");
const Message = require("../models/Message");
const Profile = require("../models/Profile");
const User = require("../models/User");
const connectDB = require("../config/db");
const { app } = require("../server");

let server;
let baseUrl;
let connectionId;
let requestId;
let chatId;
let firstUser;
let secondUser;
let outsider;
let firstToken;
let secondToken;
let outsiderToken;
let profileSnapshot;

const apiRequest = (path, { method = "GET", token, body } = {}) =>
    new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const req = http.request(
            `${baseUrl}${path}`,
            {
                method,
                headers: {
                    ...(payload ? { "content-type": "application/json" } : {}),
                    ...(token ? { authorization: `Bearer ${token}` } : {})
                }
            },
            (res) => {
                let responseBody = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    responseBody += chunk;
                });
                res.on("end", () => {
                    try {
                        resolve({
                            status: res.statusCode,
                            body: responseBody ? JSON.parse(responseBody) : null
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );
        req.on("error", reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });

const connectWithRetry = async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            await connectDB();
            return;
        } catch (error) {
            const transientConnectionError =
                error.name === "MongoNetworkError" ||
                error.name === "MongooseServerSelectionError";
            if (!transientConnectionError || attempt === 3) {
                throw error;
            }
            await mongoose.disconnect();
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
    }
};

const login = async (username) => {
    const response = await apiRequest("/auth/dev-login", {
        method: "POST",
        body: { username }
    });
    assert.equal(response.status, 200, `Could not log in ${username}`);
    return response.body.data.token;
};

before(async () => {
    assert.equal(process.env.NODE_ENV, "development");
    assert.ok(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32);
    await connectWithRetry();

    const users = await User.find({ isSeeded: true })
        .select("_id username")
        .sort({ username: 1 })
        .lean();
    assert.equal(users.length, 9, "All nine fictional users must be seeded");

    const activeConnections = await Connection.find({ status: "active" })
        .select("pairKey")
        .lean();
    const connectedPairs = new Set(activeConnections.map(({ pairKey }) => pairKey));
    let selectedPair;
    for (let first = 0; first < users.length && !selectedPair; first += 1) {
        for (let second = first + 1; second < users.length; second += 1) {
            const pairKey = [String(users[first]._id), String(users[second]._id)].sort().join(":");
            if (!connectedPairs.has(pairKey)) {
                selectedPair = { first: users[first], second: users[second], pairKey };
                break;
            }
        }
    }
    assert.ok(selectedPair, "A pair of seeded users without an active connection is required");

    firstUser = selectedPair.first;
    secondUser = selectedPair.second;
    outsider = users.find(
        ({ _id }) => String(_id) !== String(firstUser._id) && String(_id) !== String(secondUser._id)
    );

    const testRequest = await ConnectionRequest.create({
        sender: firstUser._id,
        recipient: secondUser._id,
        pairKey: selectedPair.pairKey,
        status: "accepted"
    });
    requestId = testRequest._id;
    const connection = await Connection.create({
        participants: [firstUser._id, secondUser._id],
        pairKey: selectedPair.pairKey,
        request: requestId,
        status: "active",
        stage: "connect"
    });
    connectionId = connection._id;

    profileSnapshot = await Profile.findOne({ user: firstUser._id }).lean();
    assert.ok(profileSnapshot, "The selected seeded user must have a profile");

    server = app.listen(0);
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    [firstToken, secondToken, outsiderToken] = await Promise.all([
        login(firstUser.username),
        login(secondUser.username),
        login(outsider.username)
    ]);
});

after(async () => {
    if (mongoose.connection.readyState === 1) {
        if (connectionId) {
            const chat = await Chat.findOne({ connection: connectionId }).select("_id").lean();
            if (chat) {
                await Message.deleteMany({ chat: chat._id });
                await Chat.deleteOne({ _id: chat._id });
            }
            await Connection.deleteOne({ _id: connectionId });
        }
        if (requestId) {
            await ConnectionRequest.deleteOne({ _id: requestId });
        }
        if (profileSnapshot && firstUser) {
            await Profile.replaceOne({ _id: profileSnapshot._id }, profileSnapshot);
        }
        if (server?.listening) {
            await new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
        await mongoose.disconnect();
    }
});

test("B3 MongoDB integration: connection-scoped chat and profile/preferences APIs", async (t) => {
    let chatPath;

    await t.test("members list their connection chat and outsiders cannot", async () => {
        const list = await apiRequest("/chats", { token: firstToken });
        assert.equal(list.status, 200);
        const chat = list.body.data.chats.find(
            ({ connectionId: listedConnectionId }) => listedConnectionId === String(connectionId)
        );
        assert.ok(chat);
        assert.equal(chat.unreadCount, 0);
        chatId = chat.id;
        chatPath = `/chats/${chatId}`;

        const outsiderResponse = await apiRequest(`${chatPath}/messages`, { token: outsiderToken });
        assert.equal(outsiderResponse.status, 403);
    });

    await t.test("messages are paginated, unread counts update, and reads are member-scoped", async () => {
        const sent = await apiRequest(`${chatPath}/messages`, {
            method: "POST",
            token: firstToken,
            body: { text: "First integration message" }
        });
        assert.equal(sent.status, 201);
        assert.equal(sent.body.data.message.text, "First integration message");

        const invalidCursor = await apiRequest(`${chatPath}/messages?cursor=invalid`, {
            token: firstToken
        });
        assert.equal(invalidCursor.status, 400);

        for (let index = 0; index < 31; index += 1) {
            const response = await apiRequest(`${chatPath}/messages`, {
                method: "POST",
                token: secondToken,
                body: { text: `Page test ${index}` }
            });
            assert.equal(response.status, 201);
        }

        const newChats = await apiRequest("/chats?filter=new", { token: firstToken });
        const unreadChat = newChats.body.data.chats.find(({ id }) => id === chatId);
        assert.ok(unreadChat);
        assert.equal(unreadChat.unreadCount, 31);

        const firstPage = await apiRequest(`${chatPath}/messages`, { token: firstToken });
        assert.equal(firstPage.status, 200);
        assert.equal(firstPage.body.data.messages.length, 30);
        assert.ok(firstPage.body.data.nextCursor);
        const secondPage = await apiRequest(
            `${chatPath}/messages?cursor=${firstPage.body.data.nextCursor}`,
            { token: firstToken }
        );
        assert.equal(secondPage.body.data.messages.length, 2);
        assert.equal(secondPage.body.data.nextCursor, null);

        const read = await apiRequest(`${chatPath}/read`, {
            method: "POST",
            token: firstToken
        });
        assert.equal(read.status, 200);
        assert.equal(read.body.data.markedRead, 31);
        const afterRead = await apiRequest("/chats?filter=new", { token: firstToken });
        assert.equal(afterRead.body.data.chats.some(({ id }) => id === chatId), false);
    });

    await t.test("mute state belongs to the current connection participant", async () => {
        const mute = await apiRequest(`${chatPath}/mute`, {
            method: "PUT",
            token: firstToken,
            body: { muted: true }
        });
        assert.equal(mute.status, 200);
        assert.equal(mute.body.data.muted, true);

        const mutedChats = await apiRequest("/chats?filter=muted", { token: firstToken });
        assert.ok(mutedChats.body.data.chats.some(({ id }) => id === chatId));
        const otherMemberChats = await apiRequest("/chats?filter=muted", { token: secondToken });
        assert.equal(otherMemberChats.body.data.chats.some(({ id }) => id === chatId), false);
    });

    await t.test("profile and preference updates affect only the authenticated user's own profile", async () => {
        const update = await apiRequest("/me/profile", {
            method: "PATCH",
            token: firstToken,
            body: { bio: "B3 integration profile update" }
        });
        assert.equal(update.status, 200);
        assert.equal(update.body.data.profile.bio, "B3 integration profile update");

        const preferences = await apiRequest("/me/preferences/basic", {
            method: "PATCH",
            token: firstToken,
            body: { conversationPace: "gradual" }
        });
        assert.equal(preferences.status, 200);
        assert.equal(preferences.body.data.preferences.conversationPace, "gradual");

        const readPreferences = await apiRequest("/me/preferences/basic", { token: firstToken });
        assert.equal(readPreferences.body.data.preferences.conversationPace, "gradual");

        const invalidOwnershipChange = await apiRequest("/me/profile", {
            method: "PATCH",
            token: firstToken,
            body: { user: String(secondUser._id) }
        });
        assert.equal(invalidOwnershipChange.status, 400);

        const secondProfile = await apiRequest("/me/profile", { token: secondToken });
        assert.equal(secondProfile.status, 200);
        assert.notEqual(secondProfile.body.data.profile.user.id, String(firstUser._id));
    });
});
