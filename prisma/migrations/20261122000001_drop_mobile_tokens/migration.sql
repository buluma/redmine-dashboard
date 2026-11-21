-- The mobile app and its API are removed (CON-17), so its token tables go
-- too. At removal prod held three API tokens (two revoked, one last used
-- 2026-08-24) and no push tokens.
ALTER TABLE "MobileApiToken" DROP CONSTRAINT "MobileApiToken_userId_fkey";
ALTER TABLE "MobilePushToken" DROP CONSTRAINT "MobilePushToken_userId_fkey";
DROP TABLE "MobileApiToken";
DROP TABLE "MobilePushToken";
