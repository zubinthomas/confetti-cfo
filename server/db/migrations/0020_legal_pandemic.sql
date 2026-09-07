CREATE TYPE "public"."employee_exit_type" AS ENUM('resignation', 'termination', 'end_of_contract');--> statement-breakpoint
CREATE TABLE "employee_exits" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"employee_id" text NOT NULL,
	"division" text,
	"exit_type" "employee_exit_type" NOT NULL,
	"notice_date" text,
	"last_working_date" text,
	"reason" text,
	"exit_interview_notes" text,
	"assets_returned" boolean DEFAULT false NOT NULL,
	"full_settlement_done" boolean DEFAULT false NOT NULL,
	"rehire_eligible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "manager_id" text;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD COLUMN "basic_pay" double precision;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD COLUMN "hra" double precision;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD COLUMN "other_allowances" double precision;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD COLUMN "bonus" double precision;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD COLUMN "pf_deduction" double precision;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD COLUMN "tax_deduction" double precision;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD COLUMN "other_deductions" double precision;--> statement-breakpoint
ALTER TABLE "recruitments" ADD COLUMN "checklist" jsonb;--> statement-breakpoint
ALTER TABLE "recruitments" ADD COLUMN "converted_employee_id" text;--> statement-breakpoint
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitments" ADD CONSTRAINT "recruitments_converted_employee_id_employees_id_fk" FOREIGN KEY ("converted_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;