const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { sendRequest, listRequests, updateRequest } = require("../controllers/requestController");

const router = express.Router();

router.use(requireAuth);
router.post("/", sendRequest);
router.get("/", listRequests);
router.post("/:requestId/accept", (req, res, next) => {
    req.params.action = "accept";
    return updateRequest(req, res, next);
});
router.post("/:requestId/decline", (req, res, next) => {
    req.params.action = "decline";
    return updateRequest(req, res, next);
});
router.delete("/:requestId", (req, res, next) => {
    req.params.action = "withdraw";
    return updateRequest(req, res, next);
});

module.exports = router;
