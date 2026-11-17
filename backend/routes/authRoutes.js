const express = require("express");

const {
    requestEmailOtp,
    verifyEmailOtp,
    createDevelopmentSession
} = require("../controllers/authController");

const {
    otpIpRateLimiter,
    otpEmailRateLimiter
} = require("../middleware/rateLimit");

const router = express.Router();

router.post("/otp/request", otpIpRateLimiter, otpEmailRateLimiter, requestEmailOtp);
router.post("/otp/verify", otpIpRateLimiter, otpEmailRateLimiter, verifyEmailOtp);
router.post("/dev-login", createDevelopmentSession);

module.exports = router;
