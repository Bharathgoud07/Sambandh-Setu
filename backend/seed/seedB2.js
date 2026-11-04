const StageContent = require("../models/StageContent");
const ReflectionQuestion = require("../models/ReflectionQuestion");
const { STAGE_CONTENT, REFLECTION_QUESTIONS } = require("./b2Fixtures");

const seedB2 = async () => {
    const stageKeys = STAGE_CONTENT.map(({ stage }) => stage);
    await StageContent.deleteMany({ isMock: true, stage: { $nin: stageKeys } });
    await StageContent.bulkWrite(
        STAGE_CONTENT.map((content) => ({
            updateOne: {
                filter: { stage: content.stage },
                update: { $set: content },
                upsert: true
            }
        }))
    );

    const questionKeys = REFLECTION_QUESTIONS.map(({ key }) => key);
    await ReflectionQuestion.deleteMany({ isMock: true, key: { $nin: questionKeys } });
    await ReflectionQuestion.bulkWrite(
        REFLECTION_QUESTIONS.map((question) => ({
            updateOne: {
                filter: { key: question.key },
                update: { $set: question },
                upsert: true
            }
        }))
    );
};

module.exports = seedB2;
