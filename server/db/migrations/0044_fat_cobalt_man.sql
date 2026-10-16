CREATE TYPE "public"."tally_bill_nature" AS ENUM('receivable', 'payable');--> statement-breakpoint
CREATE TYPE "public"."tally_bill_status" AS ENUM('outstanding', 'resolved');--> statement-breakpoint
CREATE TABLE "tally_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"tally_source_id" integer NOT NULL,
	"ledger_name" text NOT NULL,
	"bill_ref" text NOT NULL,
	"bill_date" text,
	"nature" "tally_bill_nature" NOT NULL,
	"outstanding_amount" double precision NOT NULL,
	"due_date" text,
	"voucher_date" text,
	"voucher_type" text,
	"voucher_number" text,
	"voucher_amount" double precision,
	"status" "tally_bill_status" DEFAULT 'outstanding' NOT NULL,
	"last_seen_at" text NOT NULL,
	"resolved_at" text,
	"match_key" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tally_sources" ADD COLUMN "sync_bills" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tally_bills" ADD CONSTRAINT "tally_bills_tally_source_id_tally_sources_id_fk" FOREIGN KEY ("tally_source_id") REFERENCES "public"."tally_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tally_bills_source_match_key" ON "tally_bills" USING btree ("tally_source_id","match_key");