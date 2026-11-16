# D1-36: OTP Security Threat Review

**Project:** Sambandh-Setu  
**Repository:** Bharathgoud07/Sambandh-Setu  
**Task ID:** D1-36  
**Branch:** task/D1-36-otp-security-review  
**Review Type:** Static Security Review

## 1. Objective

Review the planned OTP authentication design and assess risks related to:

- OTP brute-force attacks
- Email enumeration
- OTP replay attacks

## 2. Initial Repository Observations

The inspected backend files include:

- backend/controllers/authController.js
- backend/routes/authRoutes.js
- backend/models/User.js
- backend/middleware/requireAuth.js

The inspected authentication route exposes a development login endpoint.

The User model contains email, username and password-hash fields.

The searched backend files did not reveal OTP-specific routes, controllers or model fields using the searched OTP-related identifiers.

**Assessment limitation:** OTP functionality may exist outside the inspected backend snapshot or use different names. Its absence from the complete application has not been conclusively established.

## 3. Threat Analysis

### 3.1 OTP Brute-Force Attack

**Threat:** An attacker repeatedly guesses a six-digit OTP.

**Recommended controls:**
- Maximum five verification attempts per OTP challenge.
- Lock the challenge after five failed attempts.
- Apply rate limits by IP address and email.
- Do not reset attempt counters through repeated OTP requests.

**Current status:** Implementation not verified.

### 3.2 Email Enumeration

**Threat:** An attacker discovers registered email addresses by observing different OTP request responses.

**Recommended controls:**
- Use a generic response for registered and unregistered addresses.
- Avoid exposing account existence through status codes or response messages.
- Apply rate limiting to OTP requests.

**Current status:** OTP request endpoint not identified.

### 3.3 OTP Replay Attack

**Threat:** An attacker reuses an OTP that was already successfully verified.

**Recommended controls:**
- Make each OTP single-use.
- Expire OTPs after ten minutes.
- Atomically mark an OTP as consumed.
- Reject expired and previously used codes.

**Current status:** Verification implementation not identified.

## 4. Required Security Checks

| Security control | Expected behaviour |
|---|---|
| OTP length | Six digits |
| OTP storage | Hashed |
| OTP expiration | Ten minutes |
| Verification attempts | Maximum five |
| Comparison | Constant-time |
| OTP reuse | Not allowed |
| Resend protection | Rate limited |
| Email enumeration | Generic response |

## 5. Recommended Test Cases

1. Valid OTP should be accepted.
2. Incorrect OTP should be rejected.
3. OTP should be rejected after expiration.
4. Reusing a successfully verified OTP should fail.
5. Verification should lock after five unsuccessful attempts.
6. Registered and unregistered email requests should have equivalent responses.
7. Excessive OTP requests should be rate limited.
8. Concurrent verification attempts should not allow the same OTP to be consumed twice.

Testing should use synthetic accounts and an authorized test environment.

## 6. Conclusion

The initial static review did not identify an OTP implementation in the inspected backend files.

The OTP request and verification workflow must be located or confirmed with the backend owner before implementation-level security conclusions can be made.

The three assigned threat areas are brute-force attacks, email enumeration and OTP replay.

**Review status:** Preliminary – further implementation evidence required.
