# Error tracking and alerting (D2-23)

Optional Sentry integration for the API plus the alert-channel checklist.

## 1. What is implemented

- `backend/config/sentry.js` initialises Sentry **only when `SENTRY_DSN` is set**.
  Without a DSN the SDK is not loaded and every capture is a no-op, so local
  runs, tests and CI need no account.
- `backend/server.js` captures **5xx errors only** through a small error
  middleware placed before the existing error handler. 4xx responses (404,
  validation, auth) are ignored.
- Events carry the HTTP method and the matched route pattern. **Request
  headers, cookies, bodies, query strings, IPs and user data are never sent**
  (`sendDefaultPii: false`, `delete event.request`, console/HTTP breadcrumbs
  dropped).
- `backend/scripts/sentry-smoke.js` sends one synthetic error so the DSN and
  the alert channel can be verified end to end.

## 2. Environment variables

| Variable | Required | Secret | Purpose |
|---|---|---|---|
| `SENTRY_DSN` | no | **yes** | Enables error tracking. Empty = disabled. |
| `SENTRY_ENVIRONMENT` | no | no | Defaults to `NODE_ENV` (`production` on Render). |
| `SENTRY_RELEASE` | no | no | Optional commit SHA / release tag. |

Never commit the DSN. Add it in the Render dashboard only.

## 3. Sentry setup (manual, one time)

1. Create an organisation/project at <https://sentry.io> (free plan is enough
   for the launch; it includes issue alerts).
2. Platform: **Node.js / Express**.
3. Copy the project **DSN** (Settings → Client Keys).
4. Render → `sambandh-setu-backend` → **Environment** → add:
   - `SENTRY_DSN` = the DSN (secret)
   - `SENTRY_ENVIRONMENT` = `staging`
5. **Manual Deploy** → wait for **Live**.
6. Verify:

   ```bash
   cd backend
   SENTRY_DSN="<dsn>" npm run sentry:smoke
   ```

   The sentinel error `SENTRY_SMOKE_TEST` should appear in Sentry → Issues.
   Resolve it after checking.

## 4. Alert channel (manual)

Sentry → **Alerts** → **Create Alert** → **Issues**:

| Alert | Condition | Route to |
|---|---|---|
| New backend error | A new issue is created | Slack / Discord webhook |
| Error spike | `The issue is seen more than 5 times in 5 minutes` | Slack / Discord webhook |

Routing options:

- **Slack:** Settings → Integrations → Slack → install and connect the channel.
- **Discord:** Settings → Integrations → Webhooks → add the Discord webhook URL
  and select the "Issue Alert" events.
- **Email:** add the lead's address as a fallback.

Keep the payload minimal. The integration does not send request bodies or PII;
if a custom webhook is added later, re-check this rule.

## 5. Verification checklist

- [ ] `npm run test:sentry` passes (no-op without a DSN).
- [ ] `npm run sentry:smoke` with a real DSN creates exactly one issue.
- [ ] The Slack/Discord channel receives the alert for that issue.
- [ ] The Sentry event shows method + route tags but **no headers, body, query
      string, IP or user email**.
- [ ] After the launch smoke test, resolve the sentinel issue.

## 6. Privacy

This integration follows the same rule as the log audit
(`docs/security/log-audit.md`): counts, routes and error types only. Never send
prompts, messages, tokens, emails, phone numbers or any other user data.
