const Connection = require("../models/Connection");
const ApiError = require("../utils/ApiError");

const STAGES = Connection.JOURNEY_STAGES.slice(0, 8);
const STAGE_LABELS = [
    "Connect",
    "Understand",
    "Reflect",
    "Discuss",
    "Agree",
    "Family",
    "Reflect Again",
    "Decision"
];

const getJourney = (currentStage) => {
    const activeIndex = currentStage === "complete" ? STAGES.length : STAGES.indexOf(currentStage);
    if (activeIndex < 0) {
        throw new Error(`Connection has an unsupported journey stage: ${currentStage}`);
    }

    return {
        currentStage: activeIndex === STAGES.length ? null : STAGES[activeIndex],
        stageNumber: activeIndex === STAGES.length ? STAGES.length : activeIndex + 1,
        totalStages: STAGES.length,
        completed: activeIndex === STAGES.length,
        stages: STAGES.map((stage, index) => ({
            key: stage,
            label: STAGE_LABELS[index],
            status:
                activeIndex === STAGES.length || index < activeIndex
                    ? "completed"
                    : index === activeIndex
                        ? "active"
                        : "locked"
        }))
    };
};

const assertStageExists = (stage) => {
    if (!STAGES.includes(stage)) {
        throw ApiError.notFound("Journey stage not found");
    }
    return stage;
};

const assertStageUnlocked = (currentStage, stage) => {
    assertStageExists(stage);
    const journey = getJourney(currentStage);
    const status = journey.stages.find((item) => item.key === stage).status;
    if (status === "locked") {
        throw ApiError.forbidden("This journey stage is locked");
    }
    return status;
};

module.exports = { STAGES, STAGE_LABELS, getJourney, assertStageExists, assertStageUnlocked };
