CREATE TABLE "tally_group_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tally_source_id" integer NOT NULL,
	"group_name" text NOT NULL,
	"business_unit_id" integer,
	"line_item_id" integer,
	"value_mode" "tally_value_mode" DEFAULT 'balance' NOT NULL,
	"period_granularity" "tally_period_granularity" DEFAULT 'month' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tally_group_mappings" ADD CONSTRAINT "tally_group_mappings_tally_source_id_tally_sources_id_fk" FOREIGN KEY ("tally_source_id") REFERENCES "public"."tally_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tally_group_mappings" ADD CONSTRAINT "tally_group_mappings_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tally_group_mappings" ADD CONSTRAINT "tally_group_mappings_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tally_group_mappings_source_group" ON "tally_group_mappings" USING btree ("tally_source_id","group_name");