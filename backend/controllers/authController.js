const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { requireString } = require("../utils/validation");
const { requestOtp, verifyOtp } = require("../services/otpService");

const OTP_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value) => {
    const email = requireString(value, "email", { maxLength: 254 }).toLowerCase();

    if (!OTP_EMAIL_REGEX.test(email)) {
        throw ApiError.badRequest("Please provide a valid email address");
    }

    return email;
};

const createToken = (user) => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new ApiError(
            500,
            "SERVER_CONFIGURATION_ERROR",
            "Authentication is not configured"
        );
    }

    return jwt.sign({}, process.env.JWT_SECRET, {
        subject: String(user._id),
        expiresIn: "7d",
        algorithm: "HS256",
        issuer: "sambandh-setu",
        audience: "sambandh-setu-api"
    });
};

const requestEmailOtp = async (req, res) => {
    const email = normalizeEmail(req.body?.email);

    await requestOtp(email);

    // Same response whether the email belongs to an existing user or not.
    res.status(200).json({
        message: "If the email can receive a code, an OTP will be sent.",
        expiresInSeconds: 600,
        resendAfterSeconds: 30
    });
};

const verifyEmailOtp = async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = requireString(req.body?.code, "code", { maxLength: 6 });

    if (!/^\d{6}$/.test(code)) {
        throw ApiError.badRequest("OTP must contain exactly 6 digits");
    }

    const result = await verifyOtp(email, code);

    if (!result.valid) {
        if (result.reason === "OTP_LOCKED") {
    res.set("Retry-After", "600");

    throw new ApiError(
        429,
        "OTP_LOCKED",
        "Too many incorrect attempts. Request a new OTP after the lock period.",
        [{ retryAfterSeconds: 600 }]
    );
}

throw new ApiError(
    400,
    "INVALID_OTP",
    "The OTP is invalid or has expired"
);
    }

    let user = await User.findOne({ email }).select("+email");

    let isNewUser = false;

    if (!user) {
        isNewUser = true;

        // Temporary username until the user chooses one during onboarding.
        const username = `user_${crypto.randomBytes(8).toString("hex")}`;

        user = await User.create({
            email,
            username,
            firstName: "",
            lastName: "",
            onboardingCompleted: false,
            isSeeded: false
        });
    }

    if (!user.isActive) {
        throw ApiError.forbidden("This account is inactive");
    }

    const token = createToken(user);

    res.status(200).json({
        token,
        isNewUser,
        user: {
            id: String(user._id),
            onboardingCompleted: Boolean(user.onboardingCompleted)
        }
    });
};

// Existing development login — preserved.
const createDevelopmentSession = async (req, res) => {
    if (process.env.NODE_ENV !== "development") {
        throw ApiError.forbidden(
            "Development login is only available when NODE_ENV=development"
        );
    }

    const username = req.body?.username === undefined
        ? "aanya"
        : requireString(req.body.username, "username", {
            maxLength: 50
        }).toLowerCase();

    const user = await User.findOne({
        username,
        isSeeded: true
    }).select("+isSeeded");

    if (!user || !user.isActive) {
        throw ApiError.notFound("Seeded user not found");
    }

    const token = createToken(user);

    res.json({
        data: {
            token,
            user: require("../utils/serializers").serializeUser(user)
        }
    });
};

module.exports = {
    requestEmailOtp,
    verifyEmailOtp,
    createDevelopmentSession
};
