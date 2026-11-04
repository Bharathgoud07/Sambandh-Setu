const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");

const requireAuth = async (req, res, next) => {
    const authorization = req.get("authorization") || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
        return next(ApiError.unauthorized("A bearer session token is required"));
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        return next(new ApiError(500, "SERVER_CONFIGURATION_ERROR", "Authentication is not configured"));
    }

    let claims;
    try {
        claims = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ["HS256"],
            issuer: "sambandh-setu",
            audience: "sambandh-setu-api"
        });
    } catch (error) {
        if (
            error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError"
        ) {
            return next(ApiError.unauthorized("Session token is invalid or expired"));
        }
        return next(error);
    }

    if (!mongoose.isValidObjectId(claims.sub)) {
        return next(ApiError.unauthorized("Session token is invalid"));
    }

    const user = await User.findById(claims.sub).select(
        "_id username firstName lastName isActive sharingDefault"
    );
    if (!user || !user.isActive) {
        return next(ApiError.unauthorized("Session user is no longer available"));
    }

    req.user = user;
    return next();
};

module.exports = requireAuth;
