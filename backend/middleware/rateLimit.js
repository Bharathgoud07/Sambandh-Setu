const crypto = require("node:crypto");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const ApiError = require("../utils/ApiError");

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const DEFAULT_LIMITS = Object.freeze({
    global: { windowMs: 15 * MINUTE_MS, limit: 300 },
    authIp: { windowMs: HOUR_MS, limit: 5 },
    authEmail: { windowMs: HOUR_MS, limit: 5 }
});

const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const rateLimitResponse = (req, res) => {
    const resetTime = req.rateLimit?.resetTime;
    if (resetTime instanceof Date) {
        const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
        res.set("Retry-After", String(retryAfter));
    }

    return res.status(429).json({
        error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please retry shortly.",
            details: []
        }
    });
};

const createRateLimiter = ({ windowMs, limit, keyGenerator, skip }) => {
    if (!Number.isInteger(windowMs) || windowMs < 1) {
        throw new Error("Rate limiter windowMs must be a positive integer");
    }
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Rate limiter limit must be a positive integer");
    }

    const options = {
        windowMs,
        limit,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        handler: rateLimitResponse
    };

    if (keyGenerator) options.keyGenerator = keyGenerator;
    if (skip) options.skip = skip;

    return rateLimit(options);
};

const emailKeyGenerator = (req) => {
    const email = typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (email) {
        return `email:${email}`;
    }
    return `ip:${req.ip ? ipKeyGenerator(req.ip) : "unknown"}`;
};

const skipHealthChecks = (req) =>
    req.path === "/health" || req.path.startsWith("/health/");

const globalLimiter = createRateLimiter({
    windowMs: positiveInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS, DEFAULT_LIMITS.global.windowMs),
    limit: positiveInt(process.env.RATE_LIMIT_GLOBAL_MAX, DEFAULT_LIMITS.global.limit),
    skip: skipHealthChecks
});

const authIpLimiter = createRateLimiter({
    windowMs: positiveInt(process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS, DEFAULT_LIMITS.authIp.windowMs),
    limit: positiveInt(process.env.RATE_LIMIT_AUTH_IP_MAX, DEFAULT_LIMITS.authIp.limit)
});

const authEmailLimiter = createRateLimiter({
    windowMs: positiveInt(process.env.RATE_LIMIT_AUTH_EMAIL_WINDOW_MS, DEFAULT_LIMITS.authEmail.windowMs),
    limit: positiveInt(process.env.RATE_LIMIT_AUTH_EMAIL_MAX, DEFAULT_LIMITS.authEmail.limit),
    keyGenerator: emailKeyGenerator
});

const applyTrustProxy = (app) => {
    const raw = String(process.env.TRUST_PROXY || "").trim().toLowerCase();
    if (raw === "true" || raw === "1") {
        app.set("trust proxy", 1);
    } else if (/^\d+$/.test(raw) && Number(raw) > 1) {
        app.set("trust proxy", Number(raw));
    }
};

const createUserRateLimiter = ({ windowMs = 60 * 1000, maxRequests = 20 } = {}) => {
    const userRequests = new Map();

    return (req, res, next) => {
        const userId = req.user?._id?.toString();
        if (!userId) return next(ApiError.unauthorized());

        const now = Date.now();

        for (const [id, data] of userRequests.entries()) {
            if (now - data.windowStart >= windowMs) userRequests.delete(id);
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
            key = crypto.createHash("sha256").update(email).digest("hex");
        }

        for (const [storedKey, data] of requests.entries()) {
            if (now >= data.resetAt) requests.delete(storedKey);
        }

        let entry = requests.get(key);

        if (!entry || now >= entry.resetAt) {
            entry = { count: 0, resetAt: now + windowMs };
            requests.set(key, entry);
        }

        if (entry.count >= maxRequests) {
            const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
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
    windowMs: 15 * MINUTE_MS,
    maxRequests: 20
});

const otpEmailRateLimiter = createOtpRateLimiter({
    keyType: "email",
    windowMs: 15 * MINUTE_MS,
    maxRequests: 5
});

module.exports = {
    createRateLimiter,
    emailKeyGenerator,
    globalLimiter,
    authIpLimiter,
    authEmailLimiter,
    applyTrustProxy,
    DEFAULT_LIMITS,
    createUserRateLimiter,
    otpIpRateLimiter,
    otpEmailRateLimiter
};
