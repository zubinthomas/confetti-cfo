CREATE TYPE "public"."guest_visit_type" AS ENUM('walk_in', 'event');--> statement-breakpoint
CREATE TABLE "guest_sign_ins" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"visit_type" "guest_visit_type" DEFAULT 'walk_in' NOT NULL,
	"guest_name" text NOT NULL,
	"guest_phone" text,
	"guest_email" text,
	"party_size" integer DEFAULT 1 NOT NULL,
	"purpose" text,
	"host" text,
	"location_id" text,
	"table_id" text,
	"reservation_id" text,
	"signed_in_at" text NOT NULL,
	"seated_at" text,
	"expected_until" text,
	"signed_out_at" text,
	"notes" text,
	"created_by_user_id" integer
);
--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD COLUMN "max_extra_capacity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "seated_at" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "departed_at" text;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD CONSTRAINT "guest_sign_ins_location_id_reservation_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."reservation_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD CONSTRAINT "guest_sign_ins_table_id_reservation_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."reservation_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD CONSTRAINT "guest_sign_ins_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD CONSTRAINT "guest_sign_ins_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Hand-added (drizzle-kit doesn't emit CHECK / partial indexes): a guest can't
-- leave before they arrived, and "who's on premises now" is the hot query.
ALTER TABLE "guest_sign_ins" ADD CONSTRAINT "guest_sign_ins_out_after_in" CHECK ("signed_out_at" IS NULL OR "signed_out_at" >= "signed_in_at");--> statement-breakpoint
CREATE INDEX "guest_sign_ins_on_premises" ON "guest_sign_ins" USING btree ("signed_in_at") WHERE "signed_out_at" IS NULL;