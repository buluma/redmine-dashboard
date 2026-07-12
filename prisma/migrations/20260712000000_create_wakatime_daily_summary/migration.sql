-- Create WakaTimeDailySummary table
CREATE TABLE "WakaTimeDailySummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "totalSeconds" DOUBLE PRECISION NOT NULL,
    "projectsJson" JSONB,
    "languagesJson" JSONB,
    "editorsJson" JSONB,
    "categoriesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WakaTimeDailySummary_pkey" PRIMARY KEY ("id")
);

-- Unique + index for per-user per-day lookups
CREATE UNIQUE INDEX "WakaTimeDailySummary_userId_date_key" ON "WakaTimeDailySummary"("userId", "date");
CREATE INDEX "WakaTimeDailySummary_userId_date_idx" ON "WakaTimeDailySummary"("userId", "date");

-- Foreign key
ALTER TABLE "WakaTimeDailySummary" ADD CONSTRAINT "WakaTimeDailySummary_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
