CREATE TABLE "employee_onboarding" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"employee_id" text NOT NULL,
	"division" text,
	"stage" text,
	"offer_accepted_at" text,
	"documents_collected_at" text,
	"account_created_at" text,
	"id_card_issued_at" text,
	"orientation_complete_at" text
);
--> statement-breakpoint
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_onboarding_employee_id" ON "employee_onboarding" USING btree ("employee_id");