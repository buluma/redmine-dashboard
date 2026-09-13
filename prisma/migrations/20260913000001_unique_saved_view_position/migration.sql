-- Enforce the (userId, position) invariant at the DB level instead of only
-- by convention (every write path routing through withSavedViewWrite).
-- Verified against production (2026-09-13): SavedView has 0 rows, so there
-- is no existing-duplicate data to reconcile before adding this constraint.
DROP INDEX IF EXISTS "SavedView_userId_position_idx";
CREATE UNIQUE INDEX "SavedView_userId_position_key" ON "SavedView"("userId", "position");
