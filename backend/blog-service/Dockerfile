# Use Node.js LTS version as the base image
FROM node:20-slim AS builder

# Install OpenSSL
RUN apt-get update -y && apt-get install -y openssl

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

# Build TypeScript code
RUN npm run build

# Production image
FROM node:20-slim AS production

# Install OpenSSL
RUN apt-get update -y && apt-get install -y openssl

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

# Create uploads directory
RUN mkdir -p uploads/images

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3002/ || exit 1

# Start the server
CMD ["node", "dist/server.js"]

# Development image
FROM builder AS development

# Create uploads directory
RUN mkdir -p uploads/images

# Keep the container running for development
CMD ["npm", "run", "dev"]
