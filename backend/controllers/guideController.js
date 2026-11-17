
const {
    requireObjectId,
    requireString
} = require("../utils/validation");

const ApiError = require("../utils/ApiError");

const {
    getConnectionForUser,
    getMatchId
} = require("../services/connectionAccessService");

const guideService = require("../services/guideService");

const chatWithGuide = async (req, res) => {
    const connectionId = requireObjectId(
        req.body?.connectionId,
        "connectionId"
    );

    const message = requireString(
        req.body?.message,
        "message",
        { maxLength: 500, optional: true }
    );

    const allowedIntents = [
        "conversation_ideas",
        "help_me_understand",
        "next_steps",
        "privacy_safety"
    ];

    const intent = req.body?.intent;

    if (intent !== undefined && !allowedIntents.includes(intent)) {
        throw ApiError.badRequest("Invalid Guide intent");
    }

    if (!intent && !message) {
        throw ApiError.badRequest(
            "Provide either an intent or a non-empty message"
        );
    }

    const connection = await getConnectionForUser(
        connectionId,
        req.user._id
    );

    const result = await guideService.chat({
        user_id: String(req.user._id),
        match_id: String(getMatchId(connection, req.user._id)),
        stage: connection.stage,
        ...(intent ? { intent } : {}),
        ...(message ? { message } : {})
    });

    res.json({ data: result });
};

module.exports = { chatWithGuide };
