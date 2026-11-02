CREATE TYPE "public"."compliance_payment_category" AS ENUM('licence_tax', 'insurance');--> statement-breakpoint
CREATE TABLE "compliance_directors" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"din" text NOT NULL,
	"name" text,
	"designation" text,
	"date_of_appointment_raw" text,
	"date_of_appointment" text,
	"aadhaar_number" text,
	"pan_number" text,
	"email" text,
	"contact_number" text
);
--> statement-breakpoint
CREATE TABLE "compliance_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"document_name" text NOT NULL,
	"document_type" text,
	"document_number" text,
	"issue_date_raw" text,
	"issue_date" text,
	"filing_date_raw" text,
	"filing_date" text,
	"expiry_date_raw" text,
	"expiry_date" text,
	"status" text,
	"remarks" text,
	"match_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"category" "compliance_payment_category" NOT NULL,
	"location" text NOT NULL,
	"item_name" text NOT NULL,
	"detail" text,
	"policy_number" text,
	"due_date_raw" text,
	"due_date" text,
	"amount" double precision,
	"payment_status" text,
	"paid_on" text,
	"scheduled_follow_up_raw" text,
	"scheduled_follow_up" text,
	"remarks" text,
	"source_sheet" text NOT NULL,
	"source_row" integer NOT NULL,
	"match_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_trademarks" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"application_no" text NOT NULL,
	"nice_class" integer,
	"date_of_application_raw" text,
	"date_of_application" text,
	"mark_name" text,
	"tm_type" text,
	"status" text,
	"remarks" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_directors_din" ON "compliance_directors" USING btree ("din");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_documents_match_key" ON "compliance_documents" USING btree ("match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_payments_match_key" ON "compliance_payments" USING btree ("match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_trademarks_application_no" ON "compliance_trademarks" USING btree ("application_no");