const assert = require("node:assert/strict");
const { test } = require("node:test");
const { getJourney, STAGES } = require("../services/journeyService");
const { validateAnswerValue } = require("../controllers/reflectionController");
const { STAGE_CONTENT, REFLECTION_QUESTIONS } = require("../seed/b2Fixtures");

test("mock B2 fixtures contain exactly eight stages and ten questions", () => {
    assert.equal(STAGE_CONTENT.length, 8);
    assert.deepEqual(STAGE_CONTENT.map((content) => content.stage), STAGES);
    assert.ok(STAGE_CONTENT.every((content) => content.isMock === true));
    assert.equal(REFLECTION_QUESTIONS.length, 10);
    assert.deepEqual(
        [...new Set(REFLECTION_QUESTIONS.map((question) => question.type))].sort(),
        ["free_text", "multi_select", "rating", "single_select"]
    );
    assert.ok(REFLECTION_QUESTIONS.every((question) => question.isMock === true));
    assert.ok(REFLECTION_QUESTIONS.every((question) => question.prompt.startsWith("[MOCK]")));
});

test("journey stage status is derived from one current-stage value", () => {
    for (const stage of STAGES) {
        assert.equal(
            getJourney(stage).stages.filter(({ status }) => status === "active").length,
            1,
            `${stage} should be the only active stage`
        );
    }

    const journey = getJourney("reflect");
    assert.equal(journey.currentStage, "reflect");
    assert.equal(journey.stageNumber, 3);
    assert.deepEqual(
        journey.stages.map(({ status }) => status),
        ["completed", "completed", "active", "locked", "locked", "locked", "locked", "locked"]
    );

    const completeJourney = getJourney("complete");
    assert.equal(completeJourney.currentStage, null);
    assert.equal(completeJourney.completed, true);
    assert.ok(completeJourney.stages.every(({ status }) => status === "completed"));
});

test("single-select answers validate options and the mock Other field limit", () => {
    const question = REFLECTION_QUESTIONS[0];
    assert.deepEqual(validateAnswerValue(question, { value: "kindness" }), { value: "kindness" });
    assert.deepEqual(
        validateAnswerValue(question, { value: "other", otherText: "A personal value" }),
        { value: "other", otherText: "A personal value" }
    );
    assert.throws(
        () => validateAnswerValue(question, { value: "other" }),
        { code: "VALIDATION_ERROR" }
    );
    assert.throws(
        () =>
            validateAnswerValue(question, {
                value: "other",
                otherText: "x".repeat(question.otherTextMaxLength + 1)
            }),
        { code: "VALIDATION_ERROR" }
    );
});

test("multi-select answers enforce options and selection limits", () => {
    const question = REFLECTION_QUESTIONS[1];
    assert.deepEqual(validateAnswerValue(question, { value: ["quiet_time"] }), {
        value: ["quiet_time"]
    });
    assert.throws(
        () =>
            validateAnswerValue(question, {
                value: question.options.slice(0, question.maxSelections + 1).map(({ value }) => value)
            }),
        { code: "VALIDATION_ERROR" }
    );
    assert.throws(
        () => validateAnswerValue(question, { value: ["quiet_time", "quiet_time"] }),
        { code: "VALIDATION_ERROR" }
    );
});

test("rating and free-text answers enforce their configured bounds", () => {
    const rating = REFLECTION_QUESTIONS[2];
    const freeText = REFLECTION_QUESTIONS[3];
    assert.deepEqual(validateAnswerValue(rating, { value: 5 }), { value: 5 });
    assert.throws(() => validateAnswerValue(rating, { value: 6 }), { code: "VALIDATION_ERROR" });
    assert.deepEqual(validateAnswerValue(freeText, { value: "A mock answer" }), {
        value: "A mock answer"
    });
    assert.throws(
        () => validateAnswerValue(freeText, { value: "x".repeat(freeText.maxLength + 1) }),
        { code: "VALIDATION_ERROR" }
    );
});
