CREATE TYPE "public"."inventory_transaction_type" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"name" text,
	"sku" text,
	"division" text,
	"category" text,
	"unit" text,
	"quantity_on_hand" double precision DEFAULT 0 NOT NULL,
	"reorder_threshold" double precision,
	"unit_cost" double precision,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"item_id" text NOT NULL,
	"type" "inventory_transaction_type" NOT NULL,
	"quantity" double precision NOT NULL,
	"note" text,
	"recorded_by_user_id" integer
);
--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;