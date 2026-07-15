CREATE TYPE "public"."setting_category" AS ENUM('server', 'security', 'llm', 'google_oauth', 'google_sheets', 'email');--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"category" "setting_category" NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_secret" boolean DEFAULT false NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key" ON "settings" USING btree ("key");