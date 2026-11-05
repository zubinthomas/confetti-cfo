CREATE TABLE "petpooja_menu_addon_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"petpooja_source_id" integer,
	"addon_group_id" text NOT NULL,
	"name" text NOT NULL,
	"rank" integer,
	"active" boolean DEFAULT true NOT NULL,
	"match_key" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petpooja_menu_addon_items" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"petpooja_source_id" integer,
	"addon_item_id" text NOT NULL,
	"name" text NOT NULL,
	"price" double precision,
	"attribute_id" text,
	"rank" integer,
	"active" boolean DEFAULT true NOT NULL,
	"match_key" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petpooja_menu_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"petpooja_source_id" integer,
	"category_id" text NOT NULL,
	"parent_category_id" text,
	"name" text NOT NULL,
	"rank" integer,
	"timings" text,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"match_key" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petpooja_menu_config" (
	"petpooja_source_id" integer PRIMARY KEY NOT NULL,
	"raw" jsonb NOT NULL,
	"source_kind" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petpooja_menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"petpooja_source_id" integer,
	"item_id" text NOT NULL,
	"category_id" text,
	"name" text NOT NULL,
	"description" text,
	"price" double precision,
	"markup_price" double precision,
	"rank" integer,
	"attribute_id" text,
	"allow_variation" boolean DEFAULT false NOT NULL,
	"allow_addon" boolean DEFAULT false NOT NULL,
	"addon_based_on_variation" boolean DEFAULT false NOT NULL,
	"order_type_raw" text,
	"gst_type" text,
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"ignore_taxes" boolean DEFAULT false NOT NULL,
	"ignore_discounts" boolean DEFAULT false NOT NULL,
	"packing_charges" double precision,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"is_combo" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"minimum_preparation_time" text,
	"spice_level" text,
	"item_tax" jsonb,
	"variations" jsonb,
	"addon" jsonb,
	"combo_details" jsonb,
	"nutrition" jsonb,
	"cuisine" jsonb,
	"tags" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"match_key" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petpooja_menu_taxes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"petpooja_source_id" integer,
	"tax_id" text NOT NULL,
	"name" text NOT NULL,
	"rate" double precision,
	"tax_type" text,
	"order_type_raw" text,
	"core_or_total" text,
	"forward_or_backward" text,
	"description" text,
	"rank" integer,
	"active" boolean DEFAULT true NOT NULL,
	"match_key" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_menu_sync_at" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_menu_sync_status" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_menu_sync_error" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_menu_sync_issues" jsonb;--> statement-breakpoint
ALTER TABLE "petpooja_menu_addon_groups" ADD CONSTRAINT "petpooja_menu_addon_groups_petpooja_source_id_petpooja_sources_id_fk" FOREIGN KEY ("petpooja_source_id") REFERENCES "public"."petpooja_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petpooja_menu_addon_items" ADD CONSTRAINT "petpooja_menu_addon_items_petpooja_source_id_petpooja_sources_id_fk" FOREIGN KEY ("petpooja_source_id") REFERENCES "public"."petpooja_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petpooja_menu_categories" ADD CONSTRAINT "petpooja_menu_categories_petpooja_source_id_petpooja_sources_id_fk" FOREIGN KEY ("petpooja_source_id") REFERENCES "public"."petpooja_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petpooja_menu_config" ADD CONSTRAINT "petpooja_menu_config_petpooja_source_id_petpooja_sources_id_fk" FOREIGN KEY ("petpooja_source_id") REFERENCES "public"."petpooja_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petpooja_menu_items" ADD CONSTRAINT "petpooja_menu_items_petpooja_source_id_petpooja_sources_id_fk" FOREIGN KEY ("petpooja_source_id") REFERENCES "public"."petpooja_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petpooja_menu_taxes" ADD CONSTRAINT "petpooja_menu_taxes_petpooja_source_id_petpooja_sources_id_fk" FOREIGN KEY ("petpooja_source_id") REFERENCES "public"."petpooja_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "petpooja_menu_addon_groups_source_match_key" ON "petpooja_menu_addon_groups" USING btree ("petpooja_source_id","match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "petpooja_menu_addon_items_source_match_key" ON "petpooja_menu_addon_items" USING btree ("petpooja_source_id","match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "petpooja_menu_categories_source_match_key" ON "petpooja_menu_categories" USING btree ("petpooja_source_id","match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "petpooja_menu_items_source_match_key" ON "petpooja_menu_items" USING btree ("petpooja_source_id","match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "petpooja_menu_taxes_source_match_key" ON "petpooja_menu_taxes" USING btree ("petpooja_source_id","match_key");