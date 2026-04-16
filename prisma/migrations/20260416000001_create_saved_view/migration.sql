-- Create SavedView table for user filter presets
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project" TEXT,
    "status" TEXT DEFAULT 'open',
    "search" TEXT,
    "sortBy" TEXT DEFAULT 'updated',
    "sortOrder" TEXT DEFAULT 'desc',
    "statusIds" INTEGER[] DEFAULT '{}',
    "priorityIds" INTEGER[] DEFAULT '{}',
    "assignedToMe" BOOLEAN DEFAULT false,
    "dueInDays" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- Index for user queries
CREATE INDEX "SavedView_userId_idx" ON "SavedView"("userId");
CREATE INDEX "SavedView_userId_position_idx" ON "SavedView"("userId", "position");

-- Foreign key to User
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
