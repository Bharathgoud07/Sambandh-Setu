# D2-28 OTP email deliverability runbook

Status: **prepared, not executed**. The backend does not have an OTP route or an
email provider module on `dev` yet, so no real send can be tested from this
branch. Real-inbox checks are manual and must only use controlled test inboxes.

## Current blockers (verified on `origin/dev`, 2026-11-17)

| Blocker | Evidence | Owner |
|---|---|---|
| No OTP API | `backend/routes/authRoutes.js` exposes only `POST /auth/dev-login` | backend |
| No email sender | `backend/package.json` has no email-provider dependency or mail module | backend |
| OTP contract mismatch | frontend calls `/auth/send-otp` and `/auth/verify-otp`; backend smoke target is `/auth/otp/request` | app + backend |
| Mock client | `src/services/api.ts` has `USE_MOCK = true` and placeholder `BASE_URL` | app |

Do not mark D2-28 done until the OTP route exists, an email provider is wired,
and the three controlled inboxes have been checked manually.

## What not to log

- Never log or paste an OTP.
- Never log or paste an email body.
- Never log provider API keys, SMTP passwords, DKIM private keys, or full
  recipient addresses. The helper prints only target index, status, latency,
  request id, retry-after, and error code.
- Test inbox addresses stay in the tester's local notes, not in the repo.

## Helper script

`backend/scripts/otp-deliverability-check.js` triggers the OTP request and
records transport-level results. It does not read the inbox.

```sh
node backend/scripts/otp-deliverability-check.js \
  --base-url https://sambandh-setu-backend.onrender.com \
  --path /auth/otp/request \
  --email setu-test-1@example.test \
  --email setu-test-2@example.test \
  --email setu-test-3@example.test
```

Options:

- `--field email` is the JSON body field. Change it if the final contract uses a
  different name.
- `--burst 4` sends four requests per inbox to observe rate limiting. Treat a
  `429` as a rate-limit observation, not as a deliverability pass.
- The script refuses plain HTTP except for localhost.
- It exits non-zero if any request is not 2xx. It never prints the response
  body.

For a staging smoke from the backend folder:

```sh
npm run check:otp-deliverability -- \
  --base-url https://sambandh-setu-backend.onrender.com \
  --email setu-test-1@example.test
```

## DNS and header guide

Use the exact SPF include host, DKIM selector, and return-path CNAME shown in the
provider dashboard. Do not hand-type provider records from memory.

### 1. SPF

- Publish exactly one SPF TXT record on the sending domain.
- Shape: `v=spf1 include:<provider-spf-host> ~all`
- Do not create a second SPF record. Multiple SPF records fail authentication.
- Keep the 10-DNS-lookup limit in mind; remove unused includes.
- The envelope sender (Return-Path) domain must be covered by SPF.

Check:

```powershell
Resolve-DnsName example.com -Type TXT
```

### 2. DKIM

- Enable DKIM for the sending domain in the provider dashboard.
- Publish the provider's public key at
  `<selector>._domainkey.<sending-domain>`.
- Prefer a 2048-bit key if the provider supports it.
- Wait for DNS propagation, then send a test and confirm `DKIM-Signature` in the
  received headers.

Check:

```powershell
Resolve-DnsName <selector>._domainkey.example.com -Type TXT
```

### 3. DMARC

Start in monitoring mode, then tighten after the reports are clean.

```
v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com; pct=100; adkim=s; aspf=s
```

After SPF and DKIM pass consistently, move to `p=quarantine`, then `p=reject`.
Alignment matters: the visible `From:` domain and the authenticated domains must
match.

Check:

```powershell
Resolve-DnsName _dmarc.example.com -Type TXT
```

### 4. Envelope and transport

- Use a dedicated transactional subdomain, for example `mail.example.com`.
- Keep the `From:` domain aligned with SPF/DKIM.
- Use the provider return-path CNAME; do not spoof a shared domain.
- Publish MX records for the bounce domain and process bounces.
- Publish a PTR/rDNS record that matches the sending host if dedicated IPs are
  used.
- Keep TLS enabled for SMTP and HTTPS for links.
- Use a real `Reply-To` mailbox; do not use `no-reply@` as the only contact.

### 5. Header checklist on a received test

- `Authentication-Results` shows `spf=pass`, `dkim=pass`, `dmarc=pass`.
- `From:` is a branded domain, not a free mailbox or shared provider domain.
- `Return-Path:` aligns with the sending domain.
- `Message-ID:` uses the sending domain.
- `Date:` is present and correct.
- `Content-Type` has a `text/plain` alternative.
- No shortener or redirect hop hides the final link domain.
- No marketing tracking pixel or unsubscribe footer in a pure OTP message.

Use Gmail "Show original", Outlook "View message source", or a test service to
confirm the headers. Do not paste the full raw message into the repo or chat.

## Template audit

- Subject is short and specific, for example "Your Sambandh verification code".
- From name is recognizable; From domain is branded.
- The OTP is text, never an image or attachment.
- The code is large, selectable, and easy to read.
- State the expiry window and "do not share this code".
- One primary action only; no marketing CTA.
- Plain-text version contains the same code and expiry.
- HTML is simple: no heavy images, no external CSS, no obfuscated links.
- Links use the branded HTTPS domain; no URL shorteners.
- Footer includes support contact and a physical address if required by policy.
- Do not include the OTP in the subject or preheader.
- Test at 360px width and with images blocked.

## Spam-fix order

Fix in this order; authentication beats copywriting.

1. SPF, DKIM, and DMARC pass and align on the exact sending domain.
2. Return-Path and `From:` are aligned; bounce domain is monitored.
3. Remove shorteners, redirects, tracking pixels, and misleading links.
4. Add a clean plain-text alternative and correct headers.
5. Send only to controlled, consented test inboxes; never purchased lists.
6. Warm up the domain/IP gradually and keep OTP volume separate from marketing.
7. Review DMARC aggregate reports and postmaster reputation.
8. Only then adjust subject/body wording.

## Manual execution checklist

- [ ] Confirm the OTP route and request contract with the backend owner.
- [ ] Confirm the email provider and sender domain.
- [ ] Publish SPF, DKIM, and DMARC; wait for propagation.
- [ ] Set provider credentials in the host environment only. Never in the repo.
- [ ] Use three controlled inboxes across different providers.
- [ ] Run the helper once per inbox and record status/latency.
- [ ] Open each inbox manually. Record inbox vs spam, timestamp, and headers.
- [ ] Confirm SPF/DKIM/DMARC pass and domains align.
- [ ] Confirm the OTP is text, expiry is stated, and the template has a plain-text
      alternative.
- [ ] Record results in the table below. Do not record the OTP or body.
- [ ] Repeat after any DNS, provider, or template change.

## Results table

| Run | UTC time | Inbox provider | Target | HTTP status | Latency ms | Received | Folder | SPF | DKIM | DMARC | Template OK | Notes |
|---:|---|---|---|---:|---:|---|---|---|---|---|---|---|
| 1 |  |  | target 1 |  |  |  |  |  |  |  |  |  |
| 2 |  |  | target 2 |  |  |  |  |  |  |  |  |  |
| 3 |  |  | target 3 |  |  |  |  |  |  |  |  |  |

Allowed values: `Received` = yes/no; `Folder` = inbox/spam/missing;
`SPF`/`DKIM`/`DMARC` = pass/fail/none. Keep the `Notes` column free of OTPs,
addresses, and message bodies.

## Evidence to attach to the task

- Build/commit under test.
- The three HTTP result lines from the helper.
- Three redacted screenshots of the inbox list (no OTP visible).
- Header authentication summary only (no full raw message).
- Completed results table.
