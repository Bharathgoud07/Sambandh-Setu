
const crypto = require("node:crypto");
const ApiError = require("../utils/ApiError");

const createUserRateLimiter = ({
    windowMs = 60 * 1000,
    maxRequests = 20
} = {}) => {
    const userRequests = new Map();

    return (req, res, next) => {
        const userId = req.user?._id?.toString();

        if (!userId) {
            return next(ApiError.unauthorized());
        }

        const now = Date.now();

        for (const [id, data] of userRequests.entries()) {
            if (now - data.windowStart >= windowMs) {
                userRequests.delete(id);
            }
        }

        const userData = userRequests.get(userId);

        if (!userData || now - userData.windowStart >= windowMs) {
            userRequests.set(userId, { windowStart: now, count: 1 });
            return next();
        }

        if (userData.count >= maxRequests) {
            return next(new ApiError(
                429,
                "RATE_LIMIT_EXCEEDED",
                "Too many Guide requests. Please try again later."
            ));
        }

        userData.count += 1;
        return next();
    };
};

const createOtpRateLimiter = ({ keyType, windowMs, maxRequests }) => {
    const requests = new Map();

    return (req, res, next) => {
        const now = Date.now();

        let key;

        if (keyType === "ip") {
            key = req.ip || "unknown";
        } else {
            const email = typeof req.body?.email === "string"
                ? req.body.email.trim().toLowerCase()
                : "";

            // Never store the raw email as a rate-limit key.
            key = crypto.createHash("sha256").update(email).digest("hex");
        }

        for (const [storedKey, data] of requests.entries()) {
            if (now >= data.resetAt) {
                requests.delete(storedKey);
            }
        }

        let entry = requests.get(key);

        if (!entry || now >= entry.resetAt) {
            entry = {
                count: 0,
                resetAt: now + windowMs
            };
            requests.set(key, entry);
        }

        if (entry.count >= maxRequests) {
            const retryAfterSeconds = Math.max(
                1,
                Math.ceil((entry.resetAt - now) / 1000)
            );

            res.set("Retry-After", String(retryAfterSeconds));

            return next(new ApiError(
                429,
                "RATE_LIMITED",
                "Too many OTP requests. Please try again later.",
                [{ retryAfterSeconds }]
            ));
        }

        entry.count += 1;
        return next();
    };
};

const otpIpRateLimiter = createOtpRateLimiter({
    keyType: "ip",
    windowMs: 15 * 60 * 1000,
    maxRequests: 20
});

const otpEmailRateLimiter = createOtpRateLimiter({
    keyType: "email",
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
});

module.exports = {
    createUserRateLimiter,
    otpIpRateLimiter,
    otpEmailRateLimiter
};
