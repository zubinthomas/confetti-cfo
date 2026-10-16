CREATE TABLE "time_log_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"hours" double precision NOT NULL,
	"note" text,
	"created_by_user_id" integer
);
--> statement-breakpoint
ALTER TABLE "time_log_entries" ADD CONSTRAINT "time_log_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;