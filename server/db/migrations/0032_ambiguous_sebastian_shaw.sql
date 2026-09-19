ALTER TYPE "public"."setting_category" ADD VALUE 'google_calendar';--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "calendar_authoritative" boolean DEFAULT false NOT NULL;