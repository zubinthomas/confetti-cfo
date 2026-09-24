CREATE TABLE "order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"client" text NOT NULL,
	"item_name" text NOT NULL,
	"size" text,
	"colour" text,
	"order_qty" double precision,
	"green_qty" double precision,
	"drawing_qty" double precision,
	"bisque_qty" double precision,
	"glaze_app_qty" double precision,
	"glaze_firing_qty" double precision,
	"ready_qty" double precision,
	"dispatch_date" text,
	"sample_status" text,
	"remarks" text,
	"source_sheet" text NOT NULL,
	"source_row" integer NOT NULL,
	"match_key" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_match_key" ON "order_lines" USING btree ("match_key");