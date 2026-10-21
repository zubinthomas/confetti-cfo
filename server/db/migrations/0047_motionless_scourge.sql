DROP TABLE "waitlist_entries" CASCADE;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD COLUMN "quoted_wait_minutes" integer;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD COLUMN "notified_at" text;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD COLUMN "notified_via" text;--> statement-breakpoint
DROP TYPE "public"."waitlist_status";