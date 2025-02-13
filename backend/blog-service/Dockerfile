# Use Node.js LTS version as the base image
FROM node:22-slim AS builder

# Install required packages
RUN apt-get update -y && apt-get install -y \
    openssl \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create service and shared directories to match source structure
RUN mkdir -p /app/blog-service /app/shared

# Install service dependencies first
WORKDIR /app/blog-service
COPY blog-service/package*.json ./
RUN npm install

# Copy service source code and shared modules
COPY blog-service/. .
COPY shared/ ../shared/

# Generate Prisma Client
WORKDIR /app/shared
RUN npx prisma generate
WORKDIR /app/blog-service

# Build TypeScript code
RUN npm run build

# Production image
FROM node:22-slim AS production

# Install required packages
RUN apt-get update -y && apt-get install -y \
    openssl \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory and create directories
WORKDIR /app
RUN mkdir -p /app/blog-service /app/shared

# Install service production dependencies
WORKDIR /app/blog-service
COPY blog-service/package*.json ./
RUN npm install --only=production

# Copy built files and modules
COPY --from=builder /app/blog-service/dist ./dist
COPY --from=builder /app/blog-service/node_modules ./node_modules
COPY --from=builder /app/shared/. ../shared/
COPY --from=builder /app/shared/node_modules ../shared/node_modules

# Create uploads and logs directories
RUN mkdir -p uploads/images && mkdir -p logs

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD ["sh","-c","curl -sf http://localhost:3002/health | grep -q '\"status\":\"healthy\"'"]

# Start the server
CMD ["node", "dist/server.js"]

# Development image
FROM builder AS development

# Create uploads and logs directories
RUN mkdir -p uploads/images && mkdir -p logs

# Keep the container running for development
CMD ["npm", "run", "dev"]
