const express = require("express");
const { submitWaitlist } = require("../controllers/waitlistController");
const waitlistRateLimit = require("../middleware/waitlistRateLimit");

const router = express.Router();

router.post("/", waitlistRateLimit, submitWaitlist);

module.exports = router;