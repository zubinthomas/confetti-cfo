CREATE TYPE "public"."bank_account_type" AS ENUM('current', 'savings', 'fixed_deposit', 'other');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"name" text NOT NULL,
	"account_type" "bank_account_type" DEFAULT 'current' NOT NULL,
	"is_restricted" boolean DEFAULT false NOT NULL,
	"restriction_note" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_balance_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"account_id" text NOT NULL,
	"as_of_date" text NOT NULL,
	"balance" double precision NOT NULL,
	"note" text,
	"recorded_by_user_id" integer
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "business_unit_key" text;--> statement-breakpoint
ALTER TABLE "bank_balance_entries" ADD CONSTRAINT "bank_balance_entries_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_balance_entries" ADD CONSTRAINT "bank_balance_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;