-- Create CustomReport table
CREATE TABLE "CustomReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomReport_pkey" PRIMARY KEY ("id")
);

-- Index for user queries
CREATE INDEX "CustomReport_userId_idx" ON "CustomReport"("userId");
CREATE INDEX "CustomReport_type_idx" ON "CustomReport"("type");

-- Foreign key
ALTER TABLE "CustomReport" ADD CONSTRAINT "CustomReport_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
