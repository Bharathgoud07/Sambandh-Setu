const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { listActiveConnections, getConnection } = require("../controllers/connectionController");
const {
    getJourneyForConnection,
    getStageContent,
    completeStage
} = require("../controllers/journeyController");
const {
    getReflectionQuestions,
    saveReflectionAnswer,
    getReflectionProgress
} = require("../controllers/reflectionController");

const router = express.Router();

router.use(requireAuth);
router.get("/:connectionId/journey", getJourneyForConnection);
router.get("/:connectionId/stages/:stage", getStageContent);
router.post("/:connectionId/stages/:stage/complete", completeStage);
router.get("/:connectionId/reflect/questions", getReflectionQuestions);
router.put("/:connectionId/reflect/answers/:questionId", saveReflectionAnswer);
router.get("/:connectionId/reflect/progress", getReflectionProgress);
router.get("/", listActiveConnections);
router.get("/:connectionId", getConnection);

module.exports = router;
