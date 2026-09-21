CREATE TYPE "public"."production_stage" AS ENUM('throwing', 'finishing', 'glazing', 'firing');--> statement-breakpoint
CREATE TABLE "production_log" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"stage" "production_stage" NOT NULL,
	"date" text NOT NULL,
	"division" text,
	"order_name" text,
	"product_name" text,
	"qty" double precision,
	"qty_raw" text,
	"throwing_qty" double precision,
	"turning_qty" double precision,
	"potter_name" text,
	"finisher_name" text,
	"glaze_type" text,
	"kiln" text,
	"firing_type" text,
	"remarks" text,
	"source_sheet" text NOT NULL,
	"source_row" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_roster" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"employee_name" text NOT NULL,
	"employee_id" text,
	"division" text,
	"functional_area" text,
	"designation" text,
	"gender" text,
	"date" text NOT NULL,
	"week_start" text NOT NULL,
	"shift_raw" text,
	"is_off" boolean DEFAULT false NOT NULL,
	"shift_start" text,
	"shift_end" text,
	"break_slot" text,
	"weekly_off_day" text
);
--> statement-breakpoint
ALTER TABLE "shift_roster" ADD CONSTRAINT "shift_roster_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_log_source" ON "production_log" USING btree ("source_sheet","source_row");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_roster_natural_key" ON "shift_roster" USING btree ("employee_name","date");