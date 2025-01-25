FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client and Build TypeScript
RUN npx prisma generate && npm run build

# Create logs directory
RUN mkdir -p logs

EXPOSE 3003

CMD ["npm", "start"]
