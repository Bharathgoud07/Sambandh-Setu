const mongoose = require("mongoose");
const ApiError = require("./ApiError");

const requireObjectId = (value, fieldName) => {
    if (typeof value !== "string" || !mongoose.isValidObjectId(value)) {
        throw ApiError.badRequest(`${fieldName} must be a valid ID`, [{ field: fieldName }]);
    }
    return value;
};

const requireString = (value, fieldName, { maxLength = 100, optional = false } = {}) => {
    if (optional && (value === undefined || value === "")) {
        return undefined;
    }
    if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
        throw ApiError.badRequest(`${fieldName} must be a non-empty string of at most ${maxLength} characters`, [
            { field: fieldName }
        ]);
    }
    return value.trim();
};

const parseFilters = (value) => {
    if (value === undefined || value === "") {
        return {};
    }

    let filters;
    try {
        filters = JSON.parse(value);
    } catch {
        throw ApiError.badRequest("filters must be a JSON object");
    }

    const allowedFields = new Set(["gender", "education", "profession"]);
    if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
        throw ApiError.badRequest("filters must be a JSON object");
    }

    const result = {};
    for (const [field, filterValue] of Object.entries(filters)) {
        if (!allowedFields.has(field)) {
            throw ApiError.badRequest(`Unsupported discover filter: ${field}`, [{ field }]);
        }
        result[field] = requireString(filterValue, `filters.${field}`, { maxLength: 100 });
    }
    return result;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { requireObjectId, requireString, parseFilters, escapeRegex };
