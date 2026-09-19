-- Multi-role ("one hat at a time"): secondaryRoles = additional assigned
-- hats; activeRole = the hat currently worn (NULL = primary role).
ALTER TABLE "UserCompany" ADD COLUMN "secondaryRoles" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "UserCompany" ADD COLUMN "activeRole" TEXT;
