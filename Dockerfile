# syntax=docker/dockerfile:1

# ---------- Stage 1: install production dependencies ----------
FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=5000

WORKDIR /app

RUN mkdir -p /app/uploads \
    && chown -R node:node /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Application source
COPY --chown=node:node package.json package-lock.json server.js ./
COPY --chown=node:node config ./config
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node middlewares ./middlewares
COPY --chown=node:node models ./models
COPY --chown=node:node routes ./routes
COPY --chown=node:node schemas ./schemas
COPY --chown=node:node services ./services
COPY --chown=node:node utils ./utils

# Verify required application files exist inside the image.
RUN test -f /app/schemas/solarEstimate.schema.js

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (Number(process.env.PORT) || 5000) + '/health') \
    .then((r) => process.exit(r.ok ? 0 : 1)) \
    .catch(() => process.exit(1))"

CMD ["node", "server.js"]