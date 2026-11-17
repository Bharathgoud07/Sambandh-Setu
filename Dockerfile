# syntax=docker/dockerfile:1
# Sambandh Setu - Node backend image (D2-21).
# No secrets are baked in: every value arrives at runtime from the host
# environment. See docs/deploy-staging.md and .dockerignore.

# ---------------------------------------------------------------- deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------- runtime
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=5000

WORKDIR /app

# Run as a non-root user.
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app backend/ ./

USER app

EXPOSE 5000

# Node 22 ships fetch, so no curl/wget is needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
