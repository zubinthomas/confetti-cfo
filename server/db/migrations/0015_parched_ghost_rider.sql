CREATE TABLE "payroll_records" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"employee_id" text NOT NULL,
	"division" text,
	"month" text NOT NULL,
	"gross_salary" double precision
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_records_employee_month" ON "payroll_records" USING btree ("employee_id","month");