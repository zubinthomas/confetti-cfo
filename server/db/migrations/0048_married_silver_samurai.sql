CREATE TABLE "permission_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"permission_id" integer NOT NULL,
	"priority" integer NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "role_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "user_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "permission_layouts" ADD CONSTRAINT "permission_layouts_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_layouts" ADD CONSTRAINT "permission_layouts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_layouts" ADD CONSTRAINT "role_layouts_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_layouts" ADD CONSTRAINT "role_layouts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_layouts" ADD CONSTRAINT "user_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_layouts_permission" ON "permission_layouts" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_layouts_role" ON "role_layouts" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_layouts_user" ON "user_layouts" USING btree ("user_id");