CREATE TABLE "revenue_target_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"category" "revenue_target_category" NOT NULL,
	"target_amount" double precision NOT NULL,
	"note" text,
	"created_date" text NOT NULL,
	"created_by_user_id" integer
);
--> statement-breakpoint
ALTER TABLE "revenue_target_revisions" ADD CONSTRAINT "revenue_target_revisions_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_target_revisions" ADD CONSTRAINT "revenue_target_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;