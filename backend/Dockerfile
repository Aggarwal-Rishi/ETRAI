# ETRAI Backend Production Dockerfile (Debian Slim)
FROM node:20-slim

WORKDIR /app

# Install OpenSSL and CA certificates
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Prisma client generation
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY src ./src

EXPOSE 5000

CMD ["node", "src/server.js"]
