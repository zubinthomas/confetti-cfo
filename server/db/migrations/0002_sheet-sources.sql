CREATE TYPE "public"."sheet_access_method" AS ENUM('link', 'service_account');--> statement-breakpoint
CREATE TABLE "sheet_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"sheet_url" text NOT NULL,
	"access_method" "sheet_access_method" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"last_sync_at" text,
	"last_sync_status" text,
	"last_sync_error" text
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "source_type" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "sheet_source_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "sheet_sources_spreadsheet_id" ON "sheet_sources" USING btree ("spreadsheet_id");--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_sheet_source_id_sheet_sources_id_fk" FOREIGN KEY ("sheet_source_id") REFERENCES "public"."sheet_sources"("id") ON DELETE set null ON UPDATE no action;