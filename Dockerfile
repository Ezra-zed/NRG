# syntax=docker/dockerfile:1

# ---------- Stage 1: install production dependencies ----------
# glibc-based slim image: bcrypt ships prebuilt binaries for this platform,
# so no compiler toolchain is needed in the final image.
FROM node:22-bookworm-slim AS deps

WORKDIR /app

# Install with a clean, reproducible dependency tree (package-lock.json).
# --omit=dev keeps nodemon & co. out of the production image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=5000

WORKDIR /app

# uploads/ is written to at runtime (multer disk storage) — pre-create it and
# hand the whole app directory to the unprivileged 'node' user.
RUN mkdir -p /app/uploads \
    && chown -R node:node /app

# Production dependency tree from the deps stage.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Application source (explicit list → nothing secret or extraneous sneaks in).
COPY --chown=node:node package.json package-lock.json server.js ./
COPY --chown=node:node config ./config
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node middlewares ./middlewares
COPY --chown=node:node models ./models
COPY --chown=node:node routes ./routes
COPY --chown=node:node services ./services
COPY --chown=node:node utils ./utils

# Run as the unprivileged 'node' user (never root).
USER node

EXPOSE 5000

# Probe the dedicated /health endpoint: confirms the HTTP stack actually
# serves requests, not just that the port is open.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (Number(process.env.PORT) || 5000) + '/health') \
    .then((r) => process.exit(r.ok ? 0 : 1)) \
    .catch(() => process.exit(1))"

# node handles SIGTERM itself; no init wrapper needed (no child processes).
CMD ["node", "server.js"]
