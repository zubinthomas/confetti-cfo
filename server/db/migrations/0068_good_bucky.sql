CREATE TYPE "public"."doc_type" AS ENUM('id_card', 'salary_slip');--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"elements" jsonb NOT NULL,
	"created_date" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by_user_id" integer
);
--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_templates_default_per_doctype" ON "document_templates" USING btree ("doc_type") WHERE "document_templates"."is_default" = true;