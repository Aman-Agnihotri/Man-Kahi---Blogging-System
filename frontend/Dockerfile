# Build stage
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/.output ./output
COPY --from=builder /app/.nuxt ./.nuxt
COPY --from=builder /app/package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]

# Development stage
FROM builder AS development

# Keep the container running for development
CMD ["npm", "run", "dev"]
