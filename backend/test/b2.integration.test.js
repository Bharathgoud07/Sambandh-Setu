require("dotenv").config();

const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");
const mongoose = require("mongoose");
const Connection = require("../models/Connection");
const ConnectionRequest = require("../models/ConnectionRequest");
const ReflectionAnswer = require("../models/ReflectionAnswer");
const ReflectionQuestion = require("../models/ReflectionQuestion");
const StageContent = require("../models/StageContent");
const User = require("../models/User");
const connectDB = require("../config/db");
const { app } = require("../server");

let server;
let baseUrl;
let connectionId;
let requestId;
let aanyaId;
let rohanId;
let aanyaToken;
let rohanToken;
let karthikToken;
let questions;
let originalAanyaSharingDefault;

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

const answerFor = (question) => {
    switch (question.type) {
        case "single_select":
            return { value: question.options[0].value };
        case "multi_select":
            return { value: question.options.slice(0, question.minSelections || 1).map(({ value }) => value) };
        case "rating":
            return { value: 4 };
        case "free_text":
            return { value: "A fictional test response." };
        default:
            throw new Error(`Unexpected reflection type: ${question.type}`);
    }
};

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

before(async () => {
    assert.equal(process.env.NODE_ENV, "development");
    assert.ok(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32);
    await connectWithRetry();

    const seededUsers = await User.find({
        username: { $in: ["aanya", "rohan", "karthik", "arjun", "varun", "siddharth", "aditya", "sai-kiran", "nikhil"] },
        isSeeded: true
    })
        .select("_id username")
        .lean();
    assert.equal(seededUsers.length, 9);
    const aanya = seededUsers.find((user) => user.username === "aanya");
    const rohan = seededUsers.find((user) => user.username === "rohan");
    const karthik = seededUsers.find((user) => user.username === "karthik");
    assert.ok(aanya && rohan && karthik);
    aanyaId = aanya._id;
    rohanId = rohan._id;
    originalAanyaSharingDefault = (await User.findById(aanyaId).select("sharingDefault"))
        .sharingDefault;

    assert.equal(await StageContent.countDocuments({ isMock: true }), 8);
    questions = await ReflectionQuestion.find({ isMock: true }).sort({ order: 1 }).lean();
    assert.equal(questions.length, 10);

    const pairKey = [String(aanyaId), String(rohanId)].sort().join(":");
    assert.equal(
        await Connection.exists({ pairKey, status: "active" }),
        null,
        "Aanya and Rohan must not already have an active connection for the test"
    );
    const [sender, recipient] = [aanya, rohan];
    const testRequest = await ConnectionRequest.create({
        sender: sender._id,
        recipient: recipient._id,
        pairKey,
        status: "accepted"
    });
    requestId = testRequest._id;
    const connection = await Connection.create({
        participants: [sender._id, recipient._id],
        pairKey,
        request: requestId,
        status: "active",
        stage: "connect"
    });
    connectionId = connection._id;

    server = app.listen(0);
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const [aanyaLogin, rohanLogin, karthikLogin] = await Promise.all(
        ["aanya", "rohan", "karthik"].map((username) =>
            apiRequest("/auth/dev-login", {
                method: "POST",
                body: { username }
            })
        )
    );
    assert.equal(aanyaLogin.status, 200);
    assert.equal(rohanLogin.status, 200);
    assert.equal(karthikLogin.status, 200);
    aanyaToken = aanyaLogin.body.data.token;
    rohanToken = rohanLogin.body.data.token;
    karthikToken = karthikLogin.body.data.token;
});

after(async () => {
    if (mongoose.connection.readyState === 1) {
        if (connectionId) {
            await ReflectionAnswer.deleteMany({ connection: connectionId });
            await Connection.deleteOne({ _id: connectionId });
        }
        if (aanyaId && originalAanyaSharingDefault) {
            await User.updateOne(
                { _id: aanyaId },
                { $set: { sharingDefault: originalAanyaSharingDefault } }
            );
        }
        if (requestId) {
            await ConnectionRequest.deleteOne({ _id: requestId });
        }
    }
    if (server?.listening) {
        await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
});

test("B2 MongoDB integration: journey progression, reflection resume and privacy", async (t) => {
    await t.test("journey and stage content are scoped to connection members and marked mock", async () => {
        const [journey, content, outsider] = await Promise.all([
            apiRequest(`/connections/${connectionId}/journey`, { token: aanyaToken }),
            apiRequest(`/connections/${connectionId}/stages/connect`, { token: aanyaToken }),
            apiRequest(`/connections/${connectionId}/journey`, { token: karthikToken })
        ]);
        assert.equal(journey.status, 200);
        assert.equal(journey.body.data.journey.currentStage, "connect");
        assert.equal(journey.body.data.journey.stages[0].status, "active");
        assert.equal(journey.body.data.journey.stages[1].status, "locked");
        assert.equal(content.status, 200);
        assert.equal(content.body.data.stageContent.stage, "connect");
        assert.equal(content.body.data.stageContent.isMock, true);
        assert.equal(outsider.status, 403);
    });

    await t.test("locked stages cannot be completed; concurrent current-stage updates advance once", async () => {
        const locked = await apiRequest(
            `/connections/${connectionId}/stages/understand/complete`,
            { method: "POST", token: aanyaToken }
        );
        assert.equal(locked.status, 403);

        const completions = await Promise.all([
            apiRequest(`/connections/${connectionId}/stages/connect/complete`, {
                method: "POST",
                token: aanyaToken
            }),
            apiRequest(`/connections/${connectionId}/stages/connect/complete`, {
                method: "POST",
                token: rohanToken
            })
        ]);
        assert.deepEqual(completions.map(({ status }) => status).sort(), [200, 409]);
        const journey = await apiRequest(`/connections/${connectionId}/journey`, {
            token: aanyaToken
        });
        assert.equal(journey.body.data.journey.currentStage, "understand");
        assert.equal(journey.body.data.journey.stages[0].status, "completed");
        assert.equal(journey.body.data.journey.stages[1].status, "active");
    });

    await t.test("only the active Understand stage can be completed", async () => {
        const response = await apiRequest(
            `/connections/${connectionId}/stages/understand/complete`,
            { method: "POST", token: rohanToken }
        );
        assert.equal(response.status, 200);
        assert.equal(response.body.data.journey.currentStage, "reflect");
        const duplicate = await apiRequest(
            `/connections/${connectionId}/stages/understand/complete`,
            { method: "POST", token: aanyaToken }
        );
        assert.equal(duplicate.status, 409);
    });

    await t.test("reflection supports resume and filters private answers in the database", async () => {
        const questionsResponse = await apiRequest(
            `/connections/${connectionId}/reflect/questions`,
            { token: aanyaToken }
        );
        assert.equal(questionsResponse.status, 200);
        assert.equal(questionsResponse.body.data.questions.length, 10);
        assert.ok(questionsResponse.body.data.questions.every(({ isMock }) => isMock));

        const incomplete = await apiRequest(
            `/connections/${connectionId}/stages/reflect/complete`,
            { method: "POST", token: aanyaToken }
        );
        assert.equal(incomplete.status, 409);

        const sharingDefault = await apiRequest("/me/sharing-default", {
            method: "PUT",
            token: aanyaToken,
            body: { sharing: "share_later" }
        });
        assert.equal(sharingDefault.status, 200);
        assert.equal(sharingDefault.body.data.sharingDefault, "share_later");

        const firstQuestion = questions[0];
        const firstAnswer = await apiRequest(
            `/connections/${connectionId}/reflect/answers/${firstQuestion._id}`,
            {
                method: "PUT",
                token: aanyaToken,
                body: answerFor(firstQuestion)
            }
        );
        assert.equal(firstAnswer.status, 200);
        assert.equal(firstAnswer.body.data.answer.sharing, "share_later");
        const editedAnswer = await apiRequest(
            `/connections/${connectionId}/reflect/answers/${firstQuestion._id}`,
            {
                method: "PUT",
                token: aanyaToken,
                body: { ...answerFor(firstQuestion), sharing: "keep_private" }
            }
        );
        assert.equal(editedAnswer.status, 200);
        assert.equal(editedAnswer.body.data.answer.id, firstAnswer.body.data.answer.id);
        assert.equal(editedAnswer.body.data.answer.sharing, "keep_private");
        const partialProgress = await apiRequest(
            `/connections/${connectionId}/reflect/progress`,
            { token: aanyaToken }
        );
        assert.equal(partialProgress.body.data.progress.answeredCount, 1);
        assert.equal(partialProgress.body.data.progress.answers.mine.length, 1);

        for (const question of questions.slice(1)) {
            await apiRequest(
                `/connections/${connectionId}/reflect/answers/${question._id}`,
                {
                    method: "PUT",
                    token: aanyaToken,
                    body: {
                        ...answerFor(question),
                        sharing:
                            question.order === 2
                                ? "share_with_match"
                                : question.order === 3
                                    ? "share_later"
                                    : "keep_private"
                    }
                }
            ).then((response) => assert.equal(response.status, 200));
        }

        for (const question of questions.slice(0, 2)) {
            const response = await apiRequest(
                `/connections/${connectionId}/reflect/answers/${question._id}`,
                {
                    method: "PUT",
                    token: rohanToken,
                    body: {
                        ...answerFor(question),
                        sharing: question.order === 2 ? "share_with_match" : "keep_private"
                    }
                }
            );
            assert.equal(response.status, 200);
        }

        const [aanyaProgress, rohanProgress, unauthorizedAnswer] = await Promise.all([
            apiRequest(`/connections/${connectionId}/reflect/progress`, { token: aanyaToken }),
            apiRequest(`/connections/${connectionId}/reflect/progress`, { token: rohanToken }),
            apiRequest(
                `/connections/${connectionId}/reflect/answers/${questions[0]._id}`,
                { method: "PUT", token: karthikToken, body: answerFor(questions[0]) }
            )
        ]);
        assert.equal(aanyaProgress.status, 200);
        assert.equal(aanyaProgress.body.data.progress.answeredCount, 10);
        assert.equal(aanyaProgress.body.data.progress.complete, true);
        assert.equal(aanyaProgress.body.data.progress.answers.mine.length, 10);
        assert.deepEqual(
            aanyaProgress.body.data.progress.answers.sharedWithMe.map(({ questionId }) => questionId),
            [String(questions[1]._id)]
        );
        assert.equal(rohanProgress.body.data.progress.answeredCount, 2);
        assert.deepEqual(
            rohanProgress.body.data.progress.answers.sharedWithMe.map(({ questionId }) => questionId),
            [String(questions[1]._id)]
        );
        assert.equal(unauthorizedAnswer.status, 403);
    });

    await t.test("Reflect completion requires all answers and updates Home, Journey, and Connections", async () => {
        const completed = await apiRequest(
            `/connections/${connectionId}/stages/reflect/complete`,
            { method: "POST", token: aanyaToken }
        );
        assert.equal(completed.status, 200);
        assert.equal(completed.body.data.journey.currentStage, "discuss");
        assert.equal(
            completed.body.data.journey.stages.find(({ key }) => key === "reflect").status,
            "completed"
        );

        const duplicate = await apiRequest(
            `/connections/${connectionId}/stages/reflect/complete`,
            { method: "POST", token: rohanToken }
        );
        assert.equal(duplicate.status, 409);

        const [home, connections, journey] = await Promise.all([
            apiRequest("/home", { token: aanyaToken }),
            apiRequest("/connections?status=active", { token: rohanToken }),
            apiRequest(`/connections/${connectionId}/journey`, { token: rohanToken })
        ]);
        assert.equal(home.body.data.currentConnection.stage, "discuss");
        assert.equal(home.body.data.journey.stage, "discuss");
        assert.equal(home.body.data.journey.stageNumber, 4);
        const connection = connections.body.data.connections.find(
            ({ id }) => id === String(connectionId)
        );
        assert.ok(connection);
        assert.equal(connection.stage, "discuss");
        assert.equal(connection.journey.currentStage, "discuss");
        assert.equal(journey.body.data.journey.currentStage, "discuss");
    });

    await t.test("the remaining stages advance in order and Decision completes the journey", async () => {
        const remainingStages = ["discuss", "agree", "family", "reflect_again", "decision"];
        for (const stage of remainingStages) {
            const response = await apiRequest(
                `/connections/${connectionId}/stages/${stage}/complete`,
                {
                    method: "POST",
                    token: stage === "discuss" ? rohanToken : aanyaToken
                }
            );
            assert.equal(response.status, 200, stage);
            if (stage !== "decision") {
                assert.equal(
                    response.body.data.journey.currentStage,
                    remainingStages[remainingStages.indexOf(stage) + 1]
                );
            } else {
                assert.equal(response.body.data.journey.currentStage, null);
                assert.equal(response.body.data.journey.completed, true);
                assert.ok(
                    response.body.data.journey.stages.every(({ status }) => status === "completed")
                );
            }
        }

        const [home, connections] = await Promise.all([
            apiRequest("/home", { token: aanyaToken }),
            apiRequest("/connections?status=active", { token: rohanToken })
        ]);
        assert.equal(home.body.data.currentConnection.stage, "complete");
        assert.equal(home.body.data.journey.completed, true);
        assert.equal(home.body.data.journey.stageNumber, 8);
        const completedConnection = connections.body.data.connections.find(
            ({ id }) => id === String(connectionId)
        );
        assert.ok(completedConnection.journey.completed);
        assert.equal(completedConnection.journey.stages.length, 8);
    });
});
