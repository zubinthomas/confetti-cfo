CREATE TYPE "public"."import_status" AS ENUM('preview', 'committed', 'discarded');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"kind" text NOT NULL,
	"status" "import_status" NOT NULL,
	"uploaded_at" text NOT NULL,
	"committed_at" text,
	"issues" jsonb NOT NULL,
	"stats" jsonb NOT NULL,
	"payload" jsonb NOT NULL
);
