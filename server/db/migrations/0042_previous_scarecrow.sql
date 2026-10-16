CREATE TABLE "exception_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"exception_key" text NOT NULL,
	"owner_user_id" integer,
	"deadline" text,
	"note" text,
	"updated_by_user_id" integer,
	"updated_at" text
);
--> statement-breakpoint
ALTER TABLE "exception_assignments" ADD CONSTRAINT "exception_assignments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_assignments" ADD CONSTRAINT "exception_assignments_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exception_assignments_key" ON "exception_assignments" USING btree ("exception_key");