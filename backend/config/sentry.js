// Optional Sentry error tracking for the API.
//
// The integration is deliberately opt-in: when SENTRY_DSN is missing (local
// dev, tests, CI) this module never loads the SDK and every capture is a no-op.
// Request data is never attached to events - only the HTTP method and the
// matched route pattern.

let sentry = null;
let enabled = false;

const initSentry = () => {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        return false;
    }

    sentry = require("@sentry/node");
    sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
        release: process.env.SENTRY_RELEASE || undefined,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeBreadcrumb(breadcrumb) {
            // Console and HTTP breadcrumbs can contain request data or tokens.
            if (breadcrumb.category === "console" || breadcrumb.category === "http") {
                return null;
            }
            return breadcrumb;
        },
        beforeSend(event) {
            // Never send headers, cookies, bodies, query strings or IPs.
            if (event.request) {
                delete event.request;
            }
            return event;
        },
    });
    enabled = true;
    console.log("Sentry error tracking enabled");
    return true;
};

const isEnabled = () => enabled;

const captureException = (error, req) => {
    if (!enabled || !error) {
        return;
    }

    const status = error.status || error.statusCode || 500;
    if (status < 500) {
        return;
    }

    sentry.withScope((scope) => {
        scope.setLevel("error");
        if (req) {
            scope.setTag("http.method", req.method);
            scope.setTag("http.route", (req.route && req.route.path) || "unmatched");
        }
        sentry.captureException(error);
    });
};

module.exports = { initSentry, isEnabled, captureException };
