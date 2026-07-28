CREATE TABLE "user_division_scopes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"division" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_division_scopes" ADD CONSTRAINT "user_division_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_division_scopes_user_division" ON "user_division_scopes" USING btree ("user_id","division");