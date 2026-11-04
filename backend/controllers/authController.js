const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { requireString } = require("../utils/validation");
const { serializeUser } = require("../utils/serializers");

const createDevelopmentSession = async (req, res) => {
    if (process.env.NODE_ENV !== "development") {
        throw ApiError.forbidden("Development login is only available when NODE_ENV=development");
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new ApiError(500, "SERVER_CONFIGURATION_ERROR", "Authentication is not configured");
    }

    const username = req.body?.username === undefined
        ? "aanya"
        : requireString(req.body.username, "username", { maxLength: 50 }).toLowerCase();
    const user = await User.findOne({ username, isSeeded: true }).select("+isSeeded");
    if (!user || !user.isActive) {
        throw ApiError.notFound("Seeded user not found");
    }

    const token = jwt.sign({}, process.env.JWT_SECRET, {
        subject: String(user._id),
        expiresIn: "7d",
        algorithm: "HS256",
        issuer: "sambandh-setu",
        audience: "sambandh-setu-api"
    });

    res.json({ data: { token, user: serializeUser(user) } });
};

module.exports = { createDevelopmentSession };
