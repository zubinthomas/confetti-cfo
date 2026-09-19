CREATE TYPE "public"."employee_exit_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "employee_exits" ADD COLUMN "settlement_amount" double precision;--> statement-breakpoint
ALTER TABLE "employee_exits" ADD COLUMN "approval_status" "employee_exit_approval_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_exits" ADD COLUMN "approved_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "employee_exits" ADD COLUMN "approved_at" text;--> statement-breakpoint
ALTER TABLE "employee_exits" ADD COLUMN "previous_status" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "employee_id" text;--> statement-breakpoint
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;