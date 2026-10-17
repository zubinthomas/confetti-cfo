CREATE TABLE "cost_centre_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"cost_centre_id" integer,
	"business_unit_id" integer,
	"channel_id" integer,
	"vendor_id" integer,
	"exclusion_reason" text,
	"created_at" text NOT NULL,
	"created_by_user_id" integer,
	CONSTRAINT "cost_centre_members_one_target" CHECK ((
    ("cost_centre_members"."business_unit_id" IS NOT NULL)::int + ("cost_centre_members"."channel_id" IS NOT NULL)::int + ("cost_centre_members"."vendor_id" IS NOT NULL)::int = 1
  )),
	CONSTRAINT "cost_centre_members_member_xor_excluded" CHECK ((
    ("cost_centre_members"."cost_centre_id" IS NOT NULL)::int + ("cost_centre_members"."exclusion_reason" IS NOT NULL)::int = 1
  ))
);
--> statement-breakpoint
CREATE TABLE "cost_centres" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "cost_centres_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "cost_centre_members" ADD CONSTRAINT "cost_centre_members_cost_centre_id_cost_centres_id_fk" FOREIGN KEY ("cost_centre_id") REFERENCES "public"."cost_centres"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centre_members" ADD CONSTRAINT "cost_centre_members_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centre_members" ADD CONSTRAINT "cost_centre_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centre_members" ADD CONSTRAINT "cost_centre_members_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centre_members" ADD CONSTRAINT "cost_centre_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centre_members_business_unit" ON "cost_centre_members" USING btree ("business_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centre_members_channel" ON "cost_centre_members" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centre_members_vendor" ON "cost_centre_members" USING btree ("vendor_id");