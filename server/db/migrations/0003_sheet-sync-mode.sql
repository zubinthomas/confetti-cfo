CREATE TYPE "public"."sheet_sync_mode" AS ENUM('auto', 'manual', 'paused');--> statement-breakpoint
ALTER TABLE "sheet_sources" ADD COLUMN "sync_mode" "sheet_sync_mode" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
UPDATE "sheet_sources" SET "sync_mode" = 'paused' WHERE NOT "enabled";