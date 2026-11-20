
const Waitlist = require("../models/Waitlist");
const ApiError = require("../utils/ApiError");

const ALLOWED_FIELDS = new Set([
    "email",
    "name",
    "city",
    "consent",
    "website"
]);

const isPlainObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null);

const SUCCESS_RESPONSE = {
    message: "You're on the list"
};

const validateWaitlistRequest = (body) => {
    if (!isPlainObject(body)) {
        throw ApiError.badRequest("A valid request object is required", [
            { field: "body" }
        ]);
    }

    const errors = [];

    // Reject unknown fields.
    for (const field of Object.keys(body)) {
        if (!ALLOWED_FIELDS.has(field)) {
            errors.push({ field });
        }
    }

    // Check the honeypot field before normal validation.
    const honeypotFilled =
        Object.prototype.hasOwnProperty.call(body, "website") &&
        (typeof body.website !== "string" ||
            body.website.trim() !== "");

    if (honeypotFilled) {
        if (errors.length > 0) {
            throw ApiError.badRequest(
                "Request contains unsupported fields",
                errors
            );
        }

        // Return success without saving anything.
        return null;
    }

    const result = {};

    // Email validation
    if (typeof body.email !== "string") {
        errors.push({ field: "email" });
    } else {
        const email = body.email.trim().toLowerCase();

        if (
            email.length === 0 ||
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            errors.push({ field: "email" });
        } else {
            result.email = email;
        }
    }

    // Name validation
    if (typeof body.name !== "string") {
        errors.push({ field: "name" });
    } else {
        const name = body.name.trim();

        if (name.length < 2 || name.length > 80) {
            errors.push({ field: "name" });
        } else {
            result.name = name;
        }
    }

    // City is optional
    if (body.city !== undefined) {
        if (typeof body.city !== "string") {
            errors.push({ field: "city" });
        } else {
            const city = body.city.trim();

            if (city.length > 80) {
                errors.push({ field: "city" });
            } else {
                result.city = city;
            }
        }
    }

    // Consent must be exactly boolean true.
    if (body.consent !== true) {
        errors.push({ field: "consent" });
    } else {
        result.consent = true;
    }

    if (errors.length > 0) {
        throw ApiError.badRequest(
            "Waitlist validation failed",
            errors
        );
    }

    return result;
};

const submitWaitlist = async (req, res, next) => {
    try {
        const data = validateWaitlistRequest(req.body);

        // Honeypot submissions receive normal success.
        if (data === null) {
            return res.status(200).json(SUCCESS_RESPONSE);
        }

        await Waitlist.create(data);

        return res.status(200).json(SUCCESS_RESPONSE);
    } catch (error) {
        // Duplicate emails receive the same response as new signups.
        if (
            error.code === 11000 &&
            (error.keyPattern?.email || error.keyValue?.email)
        ) {
            return res.status(200).json(SUCCESS_RESPONSE);
        }

        if (error instanceof ApiError) {
            return next(error);
        }

        // Do not expose or log submitted personal information.
        return next(
            new ApiError(
                500,
                "INTERNAL_SERVER_ERROR",
                "An unexpected error occurred"
            )
        );
    }
};

module.exports = {
    submitWaitlist,
    validateWaitlistRequest
};
