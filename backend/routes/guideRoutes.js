
const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { chatWithGuide } = require("../controllers/guideController");
const {
    createUserRateLimiter
} = require("../middleware/rateLimit");

const router = express.Router();

router.use(requireAuth);

const guideRateLimiter = createUserRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 20
});

router.post("/chat", guideRateLimiter, chatWithGuide);

module.exports = router;