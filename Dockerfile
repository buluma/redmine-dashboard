FROM node:20-alpine

WORKDIR /app
ARG PRISMA_SCHEMA=prisma/schema.dev.sqlite.prisma

# Install dependencies for native modules
RUN apk add --no-cache sqlite openssl ca-certificates

# Copy package files first for better caching
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client for the selected runtime database schema
RUN npx prisma generate --schema=${PRISMA_SCHEMA}

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Run database init and start the app
CMD ["sh", "-c", "npm run db:init && exec npm run start"]
