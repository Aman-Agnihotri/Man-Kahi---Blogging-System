FROM node:22-alpine

WORKDIR /app/shared

# Copy shared module
COPY shared/ ./

# Install dependencies
RUN npm install

# Script to run migrations
CMD ["npx", "prisma", "migrate", "deploy"]
