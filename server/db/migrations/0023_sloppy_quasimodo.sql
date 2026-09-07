CREATE TYPE "public"."table_merge_kind" AS ENUM('adjacent', 'end_to_end');--> statement-breakpoint
CREATE TABLE "table_merge_members" (
	"merge_id" text NOT NULL,
	"table_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_merges" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"merge_kind" "table_merge_kind" NOT NULL,
	"combined_capacity" integer NOT NULL,
	"buffer_minutes" integer DEFAULT 30 NOT NULL,
	"created_by_user_id" integer,
	"released_at" text
);
--> statement-breakpoint
ALTER TABLE "table_merge_members" ADD CONSTRAINT "table_merge_members_merge_id_table_merges_id_fk" FOREIGN KEY ("merge_id") REFERENCES "public"."table_merges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_merge_members" ADD CONSTRAINT "table_merge_members_table_id_reservation_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."reservation_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_merges" ADD CONSTRAINT "table_merges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "table_merge_members_merge_table" ON "table_merge_members" USING btree ("merge_id","table_id");