# ETRAI Multi-Stage Production Dockerfile
# Stage 1: Build Frontend SPA
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Backend Runner
FROM node:20-alpine AS production
WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl dumb-init

ENV NODE_ENV=production
ENV PORT=5000

COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --only=production

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/src ./src
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use dumb-init for graceful termination signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
