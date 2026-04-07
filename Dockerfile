# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy manifests first to leverage Docker layer caching
COPY package*.json ./

# Use 'ci' for reproducible, locked installs
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-slim

# Set production environment for Node.js performance optimizations
ENV NODE_ENV=production

WORKDIR /app

# Only copy the files the runtime server needs
COPY package.json ./
COPY server.js ./
COPY --from=builder /app/dist ./dist

# Run as the built-in non-root 'node' user for security
USER node

# Cloud Run injects PORT; default to 8080
EXPOSE 8080

# Health check — Cloud Run will probe /healthz
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
