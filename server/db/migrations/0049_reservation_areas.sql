-- Location -> Area -> Table. The old reservation_locations rows (Cafe,
-- Restaurant, anything staff added) are the areas now, so they keep their ids
-- and every table and guest sign-in keeps pointing at the same row. Written by
-- hand: the generated diff dropped and recreated columns, which loses the links.
ALTER TABLE "reservation_locations" RENAME TO "reservation_areas";--> statement-breakpoint
ALTER INDEX "reservation_locations_pkey" RENAME TO "reservation_areas_pkey";--> statement-breakpoint
DROP INDEX "reservation_locations_name";--> statement-breakpoint
CREATE TABLE "reservation_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_locations_name" ON "reservation_locations" USING btree ("name");--> statement-breakpoint
-- Only when there is something to hold: a fresh database gets its default
-- location (and areas) from the startup seed instead.
INSERT INTO "reservation_locations" ("id", "created_date", "name")
SELECT gen_random_uuid()::text, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'Sienna, Hindustan Park'
WHERE EXISTS (SELECT 1 FROM "reservation_areas");--> statement-breakpoint
ALTER TABLE "reservation_areas" ADD COLUMN "location_id" text;--> statement-breakpoint
ALTER TABLE "reservation_areas" ADD COLUMN "floor" text;--> statement-breakpoint
UPDATE "reservation_areas" SET "location_id" = (SELECT "id" FROM "reservation_locations" LIMIT 1);--> statement-breakpoint
UPDATE "reservation_areas" SET "floor" = 'Ground Floor' WHERE "name" = 'Cafe';--> statement-breakpoint
UPDATE "reservation_areas" SET "floor" = 'First Floor' WHERE "name" = 'Restaurant';--> statement-breakpoint
ALTER TABLE "reservation_areas" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation_areas" ADD CONSTRAINT "reservation_areas_location_id_reservation_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."reservation_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_areas_location_name" ON "reservation_areas" USING btree ("location_id","name");--> statement-breakpoint
ALTER TABLE "reservation_tables" RENAME COLUMN "location_id" TO "area_id";--> statement-breakpoint
ALTER TABLE "reservation_tables" RENAME CONSTRAINT "reservation_tables_location_id_reservation_locations_id_fk" TO "reservation_tables_area_id_reservation_areas_id_fk";--> statement-breakpoint
ALTER INDEX "reservation_tables_location_name" RENAME TO "reservation_tables_area_name";--> statement-breakpoint
ALTER TABLE "guest_sign_ins" RENAME COLUMN "location_id" TO "area_id";--> statement-breakpoint
ALTER TABLE "guest_sign_ins" RENAME CONSTRAINT "guest_sign_ins_location_id_reservation_locations_id_fk" TO "guest_sign_ins_area_id_reservation_areas_id_fk";
