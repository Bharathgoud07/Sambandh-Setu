const ReflectionAnswer = require("../models/ReflectionAnswer");
const ReflectionQuestion = require("../models/ReflectionQuestion");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { getConnectionForUser, getMatchId } = require("../services/connectionAccessService");
const { assertStageUnlocked } = require("../services/journeyService");
const { requireObjectId } = require("../utils/validation");

const SHARING_CHOICES = ["keep_private", "share_with_match", "share_later"];

const serializeAnswer = (answer) => ({
    id: String(answer._id),
    questionId: String(answer.question?._id || answer.question),
    authorId: String(answer.author?._id || answer.author),
    value: answer.value,
    ...(answer.otherText ? { otherText: answer.otherText } : {}),
    sharing: answer.sharing,
    createdAt: answer.createdAt,
    updatedAt: answer.updatedAt
});

const validateAnswerValue = (question, body) => {
    const { value, otherText } = body;

    if (question.type === "single_select") {
        if (typeof value !== "string" || !question.options.some((option) => option.value === value)) {
            throw ApiError.badRequest("value must be one of the question's available options", [
                { field: "value" }
            ]);
        }
        if (value === "other" && question.allowOther) {
            if (
                typeof otherText !== "string" ||
                !otherText.trim() ||
                otherText.trim().length > question.otherTextMaxLength
            ) {
                throw ApiError.badRequest(
                    `otherText is required and must be at most ${question.otherTextMaxLength} characters`,
                    [{ field: "otherText" }]
                );
            }
            return { value, otherText: otherText.trim() };
        }
        if (otherText !== undefined) {
            throw ApiError.badRequest("otherText is only allowed when selecting Other", [
                { field: "otherText" }
            ]);
        }
        return { value };
    }

    if (question.type === "multi_select") {
        if (
            !Array.isArray(value) ||
            value.length < (question.minSelections || 0) ||
            value.length > (question.maxSelections || question.options.length) ||
            new Set(value).size !== value.length ||
            value.some(
                (optionValue) => !question.options.some((option) => option.value === optionValue)
            )
        ) {
            throw ApiError.badRequest("value must contain valid options within the selection limit", [
                { field: "value", min: question.minSelections, max: question.maxSelections }
            ]);
        }
        return { value };
    }

    if (question.type === "rating") {
        if (
            !Number.isInteger(value) ||
            value < question.minRating ||
            value > question.maxRating
        ) {
            throw ApiError.badRequest(
                `value must be an integer from ${question.minRating} to ${question.maxRating}`,
                [{ field: "value" }]
            );
        }
        return { value };
    }

    if (question.type === "free_text") {
        if (
            typeof value !== "string" ||
            !value.trim() ||
            value.trim().length > question.maxLength
        ) {
            throw ApiError.badRequest(
                `value must be a non-empty string of at most ${question.maxLength} characters`,
                [{ field: "value" }]
            );
        }
        return { value: value.trim() };
    }

    throw new ApiError(500, "REFLECTION_QUESTION_ERROR", "Unsupported reflection question type");
};

const assertReflectionUnlocked = (connection) => {
    assertStageUnlocked(connection.stage, "reflect");
};

const getReflectionQuestions = async (req, res) => {
    const connectionId = requireObjectId(req.params.connectionId, "connectionId");
    const connection = await getConnectionForUser(connectionId, req.user._id);
    assertReflectionUnlocked(connection);

    const questions = await ReflectionQuestion.find({ isMock: true })
        .sort({ order: 1 })
        .select("key order category prompt type options minSelections maxSelections allowOther otherTextMaxLength minRating maxRating maxLength isMock");

    if (questions.length !== 10) {
        throw new ApiError(500, "REFLECTION_CONTENT_ERROR", "Reflection questions are not seeded correctly");
    }
    res.json({ data: { questions } });
};

const saveReflectionAnswer = async (req, res) => {
    const connectionId = requireObjectId(req.params.connectionId, "connectionId");
    const questionId = requireObjectId(req.params.questionId, "questionId");
    const connection = await getConnectionForUser(connectionId, req.user._id);
    assertReflectionUnlocked(connection);

    const question = await ReflectionQuestion.findOne({ _id: questionId, isMock: true });
    if (!question) {
        throw ApiError.notFound("Reflection question not found");
    }
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw ApiError.badRequest("Request body must be an object");
    }
    const normalized = validateAnswerValue(question, body);
    const sharing = body.sharing === undefined ? req.user.sharingDefault : body.sharing;
    if (!SHARING_CHOICES.includes(sharing)) {
        throw ApiError.badRequest("sharing must be keep_private, share_with_match, or share_later", [
            { field: "sharing" }
        ]);
    }

    const selector = {
        connection: connection._id,
        author: req.user._id,
        question: question._id
    };
    const update = {
        $set: { ...normalized, sharing },
        $setOnInsert: selector
    };
    let answer;
    try {
        answer = await ReflectionAnswer.findOneAndUpdate(selector, update, {
            upsert: true,
            returnDocument: "after",
            runValidators: true,
            setDefaultsOnInsert: true
        });
    } catch (error) {
        if (error.code !== 11000) {
            throw error;
        }
        await ReflectionAnswer.updateOne(selector, { $set: { ...normalized, sharing } }, {
            runValidators: true
        });
        answer = await ReflectionAnswer.findOne(selector);
        if (!answer) {
            throw error;
        }
    }

    res.json({ data: { answer: serializeAnswer(answer) } });
};

const getReflectionProgress = async (req, res) => {
    const connectionId = requireObjectId(req.params.connectionId, "connectionId");
    const connection = await getConnectionForUser(connectionId, req.user._id);
    assertReflectionUnlocked(connection);
    const matchId = getMatchId(connection, req.user._id);

    const [totalQuestions, ownAnswerCount, visibleAnswers] = await Promise.all([
        ReflectionQuestion.countDocuments({ isMock: true }),
        ReflectionAnswer.countDocuments({ connection: connection._id, author: req.user._id }),
        ReflectionAnswer.find({
            connection: connection._id,
            $or: [
                { author: req.user._id },
                { author: matchId, sharing: "share_with_match" }
            ]
        })
            .populate("question", "key order category type")
            .sort({ createdAt: 1 })
            .lean()
    ]);

    if (totalQuestions !== 10) {
        throw new ApiError(500, "REFLECTION_CONTENT_ERROR", "Reflection questions are not seeded correctly");
    }

    const mine = [];
    const sharedWithMe = [];
    visibleAnswers.sort((first, second) => first.question.order - second.question.order);
    for (const answer of visibleAnswers) {
        const serialized = serializeAnswer(answer);
        if (String(answer.author) === String(req.user._id)) {
            mine.push(serialized);
        } else {
            sharedWithMe.push(serialized);
        }
    }

    res.json({
        data: {
            progress: {
                answeredCount: ownAnswerCount,
                totalQuestions,
                complete: ownAnswerCount === totalQuestions,
                answers: { mine, sharedWithMe }
            }
        }
    });
};

const updateSharingDefault = async (req, res) => {
    const { sharing } = req.body || {};
    if (!SHARING_CHOICES.includes(sharing)) {
        throw ApiError.badRequest("sharing must be keep_private, share_with_match, or share_later", [
            { field: "sharing" }
        ]);
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { sharingDefault: sharing } },
        { returnDocument: "after", runValidators: true }
    ).select("sharingDefault");
    if (!user) {
        throw ApiError.notFound("User not found");
    }
    res.json({ data: { sharingDefault: user.sharingDefault } });
};

module.exports = {
    getReflectionQuestions,
    saveReflectionAnswer,
    getReflectionProgress,
    updateSharingDefault,
    validateAnswerValue
};
