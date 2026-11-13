# Log privacy audit (D2-24)

Goal: no request body, message text, id, token, API key or raw exception text
may reach the logs. Logs should still be enough to debug (type, code, route).

Scope: every code path that runs while a request is handled, in both the Node
backend and the Python Guide.

## Findings and fixes

### Node backend

| File | Before | After |
|---|---|---|
| `backend/middleware/errorMiddleware.js:25` | `console.error("Unhandled API error:", error.message)` - driver and parser messages can embed the request body | `name=%s code=%s method=%s route=%s` |
| `backend/config/db.js:12` | `console.error("MongoDB connection failed:", error.message)` | `name=%s code=%s` |
| `backend/server.js:84` | `... disconnect after startup failure failed:`, `disconnectError.message` | `name=%s` |
| `backend/server.js:104` | `HTTP server shutdown failed:`, `error.message` | `name=%s` |
| `backend/server.js:110` | `MongoDB shutdown failed:`, `disconnectError.message` | `name=%s` |
| `backend/server.js:119` | `Server startup failed:`, `error.message` | fixed text for `CONFIG_INVALID_JWT_SECRET`; otherwise `name=%s code=%s` |
| `backend/test-db.js:19,24` | `error.message` and every `cause.message` | `name=%s code=%s` chain |
| `backend/seed/seedUsers.js:166` | `error.message` | `name=%s code=%s` |

The error response body was already generic (`An unexpected error occurred`);
it is asserted by the test as well.

### Python Guide

| File | Before | After |
|---|---|---|
| `app/core/llm_provider.py:110` | `print("Gemini request interrupted.")` on stdout | `logger.info("gemini_request_interrupted")` |
| `app/core/llm_provider.py:114` | `print(f"Gemini provider unavailable: {error}")` - provider errors can echo the prompt | `logger.warning("gemini_request_failed type=%s", type(error).__name__)` |
| `app/core/llm_provider.py:121` | `print(f"Gemini output error: {error}")` | `logger.warning("gemini_output_failed type=%s", ...)` |
| `app/core/llm_provider.py:140` | `print(f"Gemini returned invalid JSON: {error}")` | `logger.warning("gemini_invalid_json type=%s", ...)` |
| `app/core/pipeline.py:162` | `print(f"LLM provider failed: {error}")` - runs inside `run_pipeline` | `logger.warning("llm_provider_failed type=%s", ...)` |

Already safe (no change needed):

- `app/api/main.py:130` access log: request id, method, path, status, latency.
  No body, no query string.
- `app/api/main.py:97` unhandled errors: exception type + traceback frames
  (file/line/function), never `str(exc)`.
- `app/api/chat.py:58,87`: rate-limit scope and exception type only.
- `app/core/orchestrator.py:205,246`: exception type only.

The `print(...)` calls left in `if __name__ == "__main__"` blocks are developer
demos. They do not run while serving a request.

## Proof

Node (`backend/test/log-privacy.test.js`):

1. Sends malformed JSON containing a synthetic PAN, Aadhaar and OTP; asserts the
   values appear neither in the logs nor in the response body.
2. Sends a 404 with a synthetic email and OTP in the query string; asserts they
   are not logged.
3. Calls the error middleware with an error whose message contains synthetic
   PAN/Aadhaar/OTP/email; asserts only type, code and route are logged.
4. Statically scans every source file for `console.*` calls that reference
   `error.message`, `req.body`, `req.query`, `req.params` or `JSON.stringify(req)`.

Guide (`tests/failure/test_llm_provider_log_privacy.py`):

1. Makes the Gemini provider raise an error containing a marker and asserts the
   marker appears neither in the logs nor on stdout/stderr.
2. Makes `run_pipeline`'s provider lookup fail the same way and asserts the
   same.
3. Asserts the safe `type=...` line is present, so the test cannot pass because
   nothing was logged.

All markers are fake and exist only inside the tests.
