CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'notified', 'seated', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"location_id" text,
	"guest_name" text NOT NULL,
	"guest_phone" text,
	"guest_email" text,
	"party_size" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"sort_order" integer NOT NULL,
	"joined_at" text NOT NULL,
	"quoted_wait_minutes" integer,
	"notified_at" text,
	"notified_via" text,
	"seated_at" text,
	"guest_sign_in_id" text,
	"resolved_at" text,
	"cancel_reason" text,
	"created_by_user_id" integer
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_location_id_reservation_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."reservation_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_guest_sign_in_id_guest_sign_ins_id_fk" FOREIGN KEY ("guest_sign_in_id") REFERENCES "public"."guest_sign_ins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Hand-added: drizzle-kit can't emit CHECK constraints (see 0021/0022/0024).
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_party_size_positive" CHECK ("party_size" > 0);
--> statement-breakpoint
CREATE INDEX "waitlist_entries_location_status_idx" ON "waitlist_entries" ("location_id", "status");