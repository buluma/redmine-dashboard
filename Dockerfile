FROM node:20-alpine

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache sqlite openssl ca-certificates

# Copy package files first for better caching
COPY package*.json ./
RUN npm ci

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Run database init and start the app
CMD ["sh", "-c", "npm run db:init && exec npm run start"]
