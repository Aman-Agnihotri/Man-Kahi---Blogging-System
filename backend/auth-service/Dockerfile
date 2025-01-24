# Use Node.js LTS version as the base image
FROM node:20-slim AS builder

# Install OpenSSL
RUN apt-get update -y && apt-get install -y openssl

# Set working directory
WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy remaining source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production image
FROM node:20-slim AS production

# Install OpenSSL
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built files and Prisma schema
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3001/ || exit 1

# Start the server
CMD ["node", "dist/server.js"]

# Development image
FROM builder AS development

# Keep the container running for development
CMD ["npm", "run", "dev"]
