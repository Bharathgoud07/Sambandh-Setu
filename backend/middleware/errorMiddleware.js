const ApiError = require("../utils/ApiError");

const notFoundHandler = (req, res, next) => {
    next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    let apiError = error;
    if (error.type === "entity.parse.failed") {
        apiError = ApiError.badRequest("Request body must contain valid JSON");
    } else if (error.name === "ValidationError") {
        apiError = ApiError.badRequest(
            "Request validation failed",
            Object.values(error.errors).map(({ path, message }) => ({ field: path, message }))
        );
    } else if (error.name === "CastError") {
        apiError = ApiError.badRequest(`Invalid value for ${error.path}`);
    } else if (error.code === 11000) {
        apiError = ApiError.conflict("A record with the same unique value already exists");
    } else if (!(error instanceof ApiError)) {
        // Never log error.message: parser and driver messages can contain
        // request data (PAN, Aadhaar, OTP, email, phone). Type, code and the
        // matched route are enough to debug without leaking anything.
        console.error(
            "Unhandled API error: name=%s code=%s method=%s route=%s",
            error.name || "Error",
            error.code || "none",
            req.method,
            (req.route && req.route.path) || "unmatched"
        );
        apiError = new ApiError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred");
    }

    res.status(apiError.status || 500).json({
        error: {
            code: apiError.code || "INTERNAL_SERVER_ERROR",
            message: apiError.message || "An unexpected error occurred",
            details: apiError.details || []
        }
    });
};

module.exports = { notFoundHandler, errorHandler };
