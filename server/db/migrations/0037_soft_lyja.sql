CREATE TYPE "public"."import_decision_source" AS ENUM('manual', 'auto_commit', 'auto_discard_noop', 'auto_discard_duplicate_rejected', 'auto_discard_superseded');--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "decision_source" "import_decision_source";--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "decided_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_dedup" ON "import_batches" USING btree ("kind","source_type","sheet_source_id","tally_source_id","content_hash");