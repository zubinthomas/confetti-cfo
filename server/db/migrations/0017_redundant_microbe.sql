CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "reservation_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"name" text NOT NULL,
	"type" text
);
--> statement-breakpoint
CREATE TABLE "reservation_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"capacity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"table_id" text NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"duration_minutes" integer DEFAULT 90 NOT NULL,
	"party_size" integer NOT NULL,
	"guest_name" text NOT NULL,
	"guest_phone" text,
	"guest_email" text,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_by_user_id" integer
);
--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_location_id_reservation_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."reservation_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_reservation_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."reservation_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_locations_name" ON "reservation_locations" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_tables_location_name" ON "reservation_tables" USING btree ("location_id","name");