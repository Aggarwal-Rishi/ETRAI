# ETRAI Multi-Stage Production Dockerfile (Debian Slim)
# Stage 1: Build Frontend SPA
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Backend Runner
FROM node:20-slim AS production
WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies
COPY backend/package*.json ./
RUN npm ci --only=production

# Prisma client generation
COPY backend/prisma ./prisma
RUN npx prisma generate

# Source code & built frontend assets
COPY backend/src ./src
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

EXPOSE 5000

CMD ["node", "src/server.js"]
