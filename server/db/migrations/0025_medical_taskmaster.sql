CREATE TYPE "public"."tally_sync_mode" AS ENUM('auto', 'manual', 'paused');--> statement-breakpoint
CREATE TABLE "tally_ledger_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tally_source_id" integer NOT NULL,
	"ledger_name" text NOT NULL,
	"group_name" text,
	"business_unit_id" integer,
	"line_item_id" integer,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tally_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"sync_mode" "tally_sync_mode" DEFAULT 'manual' NOT NULL,
	"sync_interval_minutes" integer DEFAULT 15 NOT NULL,
	"created_at" text NOT NULL,
	"last_seen_at" text,
	"last_sync_at" text,
	"last_sync_status" text,
	"last_sync_error" text,
	"last_sync_issues" jsonb
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "tally_source_id" integer;--> statement-breakpoint
ALTER TABLE "tally_ledger_mappings" ADD CONSTRAINT "tally_ledger_mappings_tally_source_id_tally_sources_id_fk" FOREIGN KEY ("tally_source_id") REFERENCES "public"."tally_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tally_ledger_mappings" ADD CONSTRAINT "tally_ledger_mappings_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tally_ledger_mappings" ADD CONSTRAINT "tally_ledger_mappings_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tally_ledger_mappings_source_ledger" ON "tally_ledger_mappings" USING btree ("tally_source_id","ledger_name");--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_tally_source_id_tally_sources_id_fk" FOREIGN KEY ("tally_source_id") REFERENCES "public"."tally_sources"("id") ON DELETE set null ON UPDATE no action;