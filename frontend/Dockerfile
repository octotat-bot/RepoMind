# syntax=docker/dockerfile:1
#
# Build context is the PROJECT ROOT so shared/constants.json can be synced:
#     docker build -f frontend/Dockerfile .

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
COPY shared/ ../shared/

ENV NEXT_TELEMETRY_DISABLED=1
# Baked in at build time: Next.js inlines NEXT_PUBLIC_* into the client bundle.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

WORKDIR /app

RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# `output: "standalone"` emits a self-contained server with only the modules
# actually imported, which keeps the runtime image small.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
