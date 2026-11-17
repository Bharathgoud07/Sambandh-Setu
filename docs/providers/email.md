# Transactional email provider (D1-11)

Pilot provider: **Brevo Free**. Paid upgrades are not approved.

This provider is used only for OTP/transactional mail. The OTP flow itself is
owned by the auth workstream; this document covers provider setup and the exact
environment names.

## Environment names

| Name | Example / source | Secret |
|---|---|---|
| `EMAIL_PROVIDER` | `brevo` | no |
| `EMAIL_API_KEY` | Brevo API key from the dashboard | **yes** |
| `EMAIL_FROM` | verified sender address, e.g. `no-reply@your-domain` | no |

Rules:

- Keep `EMAIL_API_KEY` only in the host dashboard (Render) and local ignored
  `.env`. Never commit it, paste it in chat, or print it in logs.
- Use a sender/domain that is verified in Brevo. Do not use a free-mail address
  as the sender.
- Prefer separate staging and production API keys if Brevo allows it.
- Do not put the OTP code in logs, Sentry events, analytics, or API responses.

## Dashboard setup (manual)

1. Create/sign in to Brevo and stay on the Free plan.
2. Verify the sender email or domain under **Senders & IPs**.
3. Create an API key with transactional-email permission under **SMTP & API**
   -> **API Keys**.
4. In Render, open the Node service -> **Environment** and add:
   - `EMAIL_PROVIDER=brevo`
   - `EMAIL_API_KEY` = the key from step 3
   - `EMAIL_FROM` = the verified sender
5. Redeploy the service.
6. Run one synthetic OTP request after the auth OTP flow is deployed.
7. Confirm delivery in the recipient inbox and in Brevo's transactional log.
8. Confirm the OTP code is **not** present in the API response, Render logs, or
   Sentry.

## Verification without exposing the key

```powershell
# Names only; this prints no values.
Get-Content .env.example | Select-String '^EMAIL_'
```

After deploy, verify from the provider dashboard and the OTP inbox test. Do not
add a health endpoint that calls the email provider; provider outages should not
make `/health` fail.

## Rollback / rotation

1. Create a new key in Brevo.
2. Update `EMAIL_API_KEY` in Render only.
3. Redeploy.
4. Send one synthetic OTP and confirm delivery.
5. Revoke the old key in Brevo.

If OTP delivery fails, check:
- `EMAIL_API_KEY` is present on the correct Render service.
- `EMAIL_FROM` matches a verified sender.
- Brevo transactional log / suppression list.
- Spam folder.
- The auth OTP code path is actually calling the provider (not a dev/mock path).
