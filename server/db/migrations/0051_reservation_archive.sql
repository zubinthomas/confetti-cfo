DROP INDEX "reservation_areas_location_name";--> statement-breakpoint
DROP INDEX "reservation_locations_name";--> statement-breakpoint
DROP INDEX "reservation_tables_area_name";--> statement-breakpoint
ALTER TABLE "reservation_areas" ADD COLUMN "archived_at" text;--> statement-breakpoint
ALTER TABLE "reservation_locations" ADD COLUMN "archived_at" text;--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD COLUMN "archived_at" text;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_areas_location_name" ON "reservation_areas" USING btree ("location_id","name") WHERE "reservation_areas"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_locations_name" ON "reservation_locations" USING btree ("name") WHERE "reservation_locations"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_tables_area_name" ON "reservation_tables" USING btree ("area_id","name") WHERE "reservation_tables"."archived_at" is null;