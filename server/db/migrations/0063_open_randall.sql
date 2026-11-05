CREATE TABLE "petpooja_outbound_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"petpooja_source_id" integer,
	"status" text NOT NULL,
	"order_payload" jsonb NOT NULL,
	"last_callback_status" text,
	"last_callback_at" text,
	"last_callback_payload" jsonb,
	"cancel_reason" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_order_callback_sync_at" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_order_callback_sync_status" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_order_callback_sync_error" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_order_callback_sync_issues" jsonb;--> statement-breakpoint
ALTER TABLE "petpooja_outbound_orders" ADD CONSTRAINT "petpooja_outbound_orders_petpooja_source_id_petpooja_sources_id_fk" FOREIGN KEY ("petpooja_source_id") REFERENCES "public"."petpooja_sources"("id") ON DELETE set null ON UPDATE no action;