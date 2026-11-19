# Backend Dependency Security Audit — D2-33

**Audit date:** 19 November 2026  
**Repository:** Sambandh-Setu Backend

## 1. Dependency audit

### Production dependencies

Command: `npm audit --omit=dev`

Result: **0 vulnerabilities found.**

### Full dependency tree

Command: `npm audit`

Result: **2 moderate severity vulnerabilities.**

The finding concerns `minimatch`:

- Advisory: GHSA-g3hv-75wg-m249
- Severity: Moderate
- Dependency chain: `nodemon@3.1.14` → `minimatch@10.2.6`
- Category: Glob pattern matching denial of service (DoS).

Verification command: `npm ls minimatch nodemon`

Status: **Known, pending lead review/decision.**

No forced dependency updates were applied. `npm audit fix --force` was not run because the proposed fix could change the nodemon version in a potentially breaking way.

## 2. B1/B2/B3 integration verification

Tests were run against a dedicated local MongoDB test database, not staging or production.

| Command | Result |
|---|---:|
| `npm run seed` | 9 fictional users and profiles seeded |
| `npm run test:integration` | 10 passed |
| `npm run test:b2` | 12 passed |
| `npm run test:b3:integration` | 5 passed |
| **Total** | **27/27 passed** |

Test database: `sambandh_setu_test`

## 3. Test environment and safety

- A dedicated local MongoDB instance was used.
- No staging or production database was used.
- Local environment configuration and secrets were not included.
- No forced dependency updates were applied.

## 4. Conclusion

- Production dependency audit: **0 vulnerabilities**.
- Full dependency audit: **2 moderate development-dependency findings**, known and pending lead review/decision.
- B1/B2/B3 integration verification: **27/27 tests passed**.

This is a documentation-only change. No dependencies, lockfiles, application code, or CI configuration are changed.
