CREATE TABLE "attendance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"employee_name" text NOT NULL,
	"employee_id" text,
	"date" text NOT NULL,
	"status_code" text NOT NULL,
	"status_label" text NOT NULL,
	"in_time" text,
	"out_time" text,
	"duration_minutes" integer,
	"late_by_minutes" integer,
	"early_by_minutes" integer,
	"overtime_minutes" integer,
	"missed_in_punch" boolean DEFAULT false NOT NULL,
	"missed_out_punch" boolean DEFAULT false NOT NULL,
	"punch_records" text,
	"source" text DEFAULT 'essl' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_natural_key" ON "attendance_records" USING btree ("employee_name","date");