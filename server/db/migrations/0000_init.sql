CREATE TYPE "public"."line_item_category" AS ENUM('revenue', 'cogs', 'hr_cost', 'operating_cost', 'subtotal', 'other');--> statement-breakpoint
CREATE TYPE "public"."period_type" AS ENUM('month', 'week', 'custom');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('department', 'outlet');--> statement-breakpoint
CREATE TYPE "public"."value_type" AS ENUM('amount', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."vendor_group" AS ENUM('consignment', 'other_brands');--> statement-breakpoint
CREATE TABLE "business_units" (
	"id" integer PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"name" text NOT NULL,
	"unit_type" "unit_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" integer PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consignment_records" (
	"id" integer PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"amount" double precision NOT NULL,
	"commission_rate" double precision
);
--> statement-breakpoint
CREATE TABLE "dataset_meta" (
	"id" integer PRIMARY KEY NOT NULL,
	"meta" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"full_name" text,
	"employee_id" text,
	"division" text,
	"role" text,
	"employment_type" text,
	"status" text,
	"joining_date" text,
	"monthly_salary" double precision,
	"phone" text,
	"email" text,
	"aadhar_number" text,
	"pan_number" text,
	"blood_group" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"address" text,
	"notes" text,
	"police_verification_status" text,
	"id_proof_url" text,
	"contract_url" text,
	"police_verification_url" text,
	"health_record_url" text
);
--> statement-breakpoint
CREATE TABLE "financial_records" (
	"id" integer PRIMARY KEY NOT NULL,
	"business_unit_id" integer NOT NULL,
	"period_id" integer NOT NULL,
	"line_item_id" integer NOT NULL,
	"value" double precision NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"employee_name" text,
	"division" text,
	"leave_type" text,
	"from_date" text,
	"to_date" text,
	"days" double precision,
	"reason" text,
	"status" text
);
--> statement-breakpoint
CREATE TABLE "licences" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"licence_name" text,
	"licence_type" text,
	"authority" text,
	"location" text,
	"division" text,
	"licence_number" text,
	"issue_date" text,
	"expiry_date" text,
	"status" text,
	"renewal_reminder_days" integer,
	"annual_fee" double precision,
	"notes" text,
	"document_url" text
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" integer PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" "line_item_category" NOT NULL,
	"value_type" "value_type" NOT NULL,
	"related_amount_line_item_id" integer,
	"display_order" integer
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" integer PRIMARY KEY NOT NULL,
	"period_type" "period_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"label" text NOT NULL,
	"fiscal_year" text NOT NULL,
	"is_special_event" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitments" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"role_title" text,
	"division" text,
	"openings" integer,
	"applicant_name" text,
	"applicant_email" text,
	"applicant_phone" text,
	"stage" text,
	"expected_salary" double precision,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "sales_records" (
	"id" integer PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"category_id" integer,
	"channel_id" integer NOT NULL,
	"business_unit_id" integer,
	"amount" double precision NOT NULL,
	CONSTRAINT "sales_records_natural_key" UNIQUE NULLS NOT DISTINCT("period_id","category_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" integer PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"name" text NOT NULL,
	"commission_rate" double precision,
	"group" "vendor_group" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_records" ADD CONSTRAINT "consignment_records_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_records" ADD CONSTRAINT "consignment_records_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consignment_records_natural_key" ON "consignment_records" USING btree ("period_id","vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_records_natural_key" ON "financial_records" USING btree ("business_unit_id","period_id","line_item_id");