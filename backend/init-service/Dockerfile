FROM node:22-alpine

WORKDIR /app/shared

# Copy shared module
COPY shared/ ./

# Install dependencies
RUN npm install

# Run migrations when present; this repo currently has only schema.prisma.
CMD ["sh", "-c", "if [ -d prisma/migrations ]; then npx prisma migrate deploy; else npx prisma db push; fi"]
