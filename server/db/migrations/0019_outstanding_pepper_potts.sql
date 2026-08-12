CREATE TYPE "public"."revenue_target_category" AS ENUM('store', 'fnb');--> statement-breakpoint
CREATE TABLE "revenue_targets" (
	"id" integer PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"category" "revenue_target_category" NOT NULL,
	"target_amount" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "revenue_targets" ADD CONSTRAINT "revenue_targets_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_targets_natural_key" ON "revenue_targets" USING btree ("period_id","category");