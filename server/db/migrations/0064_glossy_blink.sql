ALTER TABLE "petpooja_sources" ADD COLUMN "store_open" boolean;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "store_closed_reason" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "store_reopen_at" text;--> statement-breakpoint
ALTER TABLE "petpooja_sources" ADD COLUMN "store_status_updated_at" text;