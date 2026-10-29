ALTER TABLE "reservation_areas" ALTER COLUMN "checkin_enabled" SET DEFAULT true;--> statement-breakpoint
UPDATE "reservation_areas" SET "checkin_enabled" = true;--> statement-breakpoint
ALTER TABLE "checkin_settings" DROP COLUMN "max_party_size";
