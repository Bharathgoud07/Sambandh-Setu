class ApiError extends Error {
    constructor(status, code, message, details = []) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        this.details = details;
    }

    static badRequest(message, details = []) {
        return new ApiError(400, "VALIDATION_ERROR", message, details);
    }

    static unauthorized(message = "Authentication is required") {
        return new ApiError(401, "UNAUTHORIZED", message);
    }

    static forbidden(message = "You are not allowed to perform this action") {
        return new ApiError(403, "FORBIDDEN", message);
    }

    static notFound(message = "Resource not found") {
        return new ApiError(404, "NOT_FOUND", message);
    }

    static conflict(message = "The requested operation conflicts with the current state") {
        return new ApiError(409, "CONFLICT", message);
    }
}

module.exports = ApiError;
