FROM oven/bun:1-alpine

WORKDIR /app
ARG PRISMA_SCHEMA=prisma/schema.dev.sqlite.prisma

# Install dependencies for native modules
RUN apk add --no-cache sqlite openssl ca-certificates

# Copy package files first for better caching
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile --ignore-scripts

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client for the selected runtime database schema
RUN bunx prisma generate --schema=${PRISMA_SCHEMA}

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Copy public assets and static chunks into standalone output so they are served
RUN cp -r public .next/standalone/public && \
    cp -r .next/static .next/standalone/.next/static

# Expose port
EXPOSE 3000
ENV HOSTNAME "0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Run database init and start the app via the standalone server
CMD ["sh", "-c", "bun run db:init && exec bun .next/standalone/server.js"]
