const Connection = require("../models/Connection");
const ReflectionAnswer = require("../models/ReflectionAnswer");
const ReflectionQuestion = require("../models/ReflectionQuestion");
const StageContent = require("../models/StageContent");
const ApiError = require("../utils/ApiError");
const { requireObjectId } = require("../utils/validation");
const { getConnectionForUser } = require("../services/connectionAccessService");
const {
    STAGES,
    assertStageExists,
    assertStageUnlocked,
    getJourney
} = require("../services/journeyService");

const getJourneyForConnection = async (req, res) => {
    const connectionId = requireObjectId(req.params.connectionId, "connectionId");
    const connection = await getConnectionForUser(connectionId, req.user._id);
    res.json({
        data: {
            journey: {
                connectionId: String(connection._id),
                ...getJourney(connection.stage)
            }
        }
    });
};

const getStageContent = async (req, res) => {
    const connectionId = requireObjectId(req.params.connectionId, "connectionId");
    const stage = assertStageExists(req.params.stage);
    const connection = await getConnectionForUser(connectionId, req.user._id);
    assertStageUnlocked(connection.stage, stage);

    const content = await StageContent.findOne({ stage });
    if (!content) {
        throw ApiError.notFound("Stage content is not available");
    }

    res.json({ data: { stageContent: content } });
};

const completeStage = async (req, res) => {
    const connectionId = requireObjectId(req.params.connectionId, "connectionId");
    const stage = assertStageExists(req.params.stage);
    const connection = await getConnectionForUser(connectionId, req.user._id);
    const stageStatus = assertStageUnlocked(connection.stage, stage);
    if (stageStatus !== "active" || connection.stage !== stage) {
        throw ApiError.conflict("Only the currently active stage can be completed");
    }

    if (stage === "reflect") {
        const questions = await ReflectionQuestion.find({ isMock: true }).select("_id").lean();
        if (questions.length !== 10) {
            throw new ApiError(
                500,
                "REFLECTION_CONTENT_ERROR",
                "Reflection questions are not seeded correctly"
            );
        }
        const questionIds = questions.map((question) => question._id);
        const answerCount = await ReflectionAnswer.countDocuments({
            connection: connection._id,
            author: req.user._id,
            question: { $in: questionIds }
        });
        if (answerCount !== questions.length) {
            throw ApiError.conflict("Answer all 10 reflection questions before completing this stage");
        }
    }

    const nextIndex = STAGES.indexOf(stage) + 1;
    const nextStage = nextIndex === STAGES.length ? "complete" : STAGES[nextIndex];
    const updated = await Connection.findOneAndUpdate(
        {
            _id: connection._id,
            participants: req.user._id,
            status: "active",
            stage
        },
        { $set: { stage: nextStage } },
        { returnDocument: "after", runValidators: true }
    );
    if (!updated) {
        throw ApiError.conflict("The active stage changed before this completion was applied");
    }

    res.json({
        data: {
            completedStage: stage,
            journey: {
                connectionId: String(updated._id),
                ...getJourney(updated.stage)
            }
        }
    });
};

module.exports = { getJourneyForConnection, getStageContent, completeStage };
