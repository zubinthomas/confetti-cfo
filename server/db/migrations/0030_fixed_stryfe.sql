CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'ordered', 'received');--> statement-breakpoint
CREATE TABLE "inventory_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"item_id" text NOT NULL,
	"received_date" text NOT NULL,
	"expiry_date" text,
	"quantity_received" double precision NOT NULL,
	"quantity_remaining" double precision NOT NULL,
	"unit_cost" double precision
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_order_id" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity_ordered" double precision NOT NULL,
	"unit_cost" double precision,
	"quantity_received" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"division" text,
	"vendor_name" text,
	"order_date" text,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "tracks_expiry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_batch_id_inventory_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."inventory_batches"("id") ON DELETE set null ON UPDATE no action;