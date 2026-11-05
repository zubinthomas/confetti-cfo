CREATE TYPE "public"."petpooja_environment" AS ENUM('sandbox', 'production');--> statement-breakpoint
CREATE TYPE "public"."petpooja_sync_mode" AS ENUM('auto', 'manual', 'paused');--> statement-breakpoint
CREATE TABLE "petpooja_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"environment" "petpooja_environment" NOT NULL,
	"rest_id" text NOT NULL,
	"app_key" text NOT NULL,
	"app_secret" text NOT NULL,
	"access_token" text NOT NULL,
	"inbound_webhook_secret_hash" text NOT NULL,
	"sync_mode" "petpooja_sync_mode" DEFAULT 'manual' NOT NULL,
	"created_at" text NOT NULL,
	"last_seen_at" text,
	"last_sync_at" text,
	"last_sync_status" text,
	"last_sync_error" text,
	"last_sync_issues" jsonb
);
--> statement-breakpoint
DROP INDEX "import_batches_dedup";--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "petpooja_source_id" integer;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_petpooja_source_id_petpooja_sources_id_fk" FOREIGN KEY ("petpooja_source_id") REFERENCES "public"."petpooja_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_dedup" ON "import_batches" USING btree ("kind","source_type","sheet_source_id","tally_source_id","petpooja_source_id","content_hash");
