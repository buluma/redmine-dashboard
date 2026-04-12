-- Fix: Remove Supabase Realtime triggers from Issue table
-- These triggers were causing "column `new` does not exist" errors
-- during Prisma upsert operations because they reference columns (entity, filters)
-- that don't exist on the Issue table.

-- Date: 2026-04-12

DROP TRIGGER IF EXISTS "Upsert" ON "Issue";
