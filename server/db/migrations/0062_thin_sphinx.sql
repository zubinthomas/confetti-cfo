ALTER TABLE "petpooja_menu_addon_items" ADD COLUMN "in_stock" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "petpooja_menu_addon_items" ADD COLUMN "auto_turn_on_time" text;--> statement-breakpoint
ALTER TABLE "petpooja_menu_addon_items" ADD COLUMN "custom_turn_on_time" text;--> statement-breakpoint
ALTER TABLE "petpooja_menu_items" ADD COLUMN "in_stock" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "petpooja_menu_items" ADD COLUMN "auto_turn_on_time" text;--> statement-breakpoint
ALTER TABLE "petpooja_menu_items" ADD COLUMN "custom_turn_on_time" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_stock_sync_at" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_stock_sync_status" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_stock_sync_error" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "last_stock_sync_issues" jsonb;
