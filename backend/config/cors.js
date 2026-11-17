const parseAllowedOrigins = (value = process.env.CORS_ALLOWED_ORIGINS) =>
    String(value || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

const corsOptions = {
    origin(origin, callback) {
        // Native mobile apps and server-to-server calls do not send an Origin
        // header. CORS is a browser rule, so those requests are allowed through.
        if (!origin) {
            return callback(null, true);
        }

        const allowedOrigins = parseAllowedOrigins();
        return callback(null, allowedOrigins.includes(origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    credentials: false,
    maxAge: 86400,
    optionsSuccessStatus: 204
};

module.exports = { corsOptions, parseAllowedOrigins };
