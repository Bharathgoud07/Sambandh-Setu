const { rateLimit } = require("express-rate-limit");

const waitlistRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,

    message: {
        message: "Too many waitlist submissions. Please try again later."
    }
});

module.exports = waitlistRateLimit;