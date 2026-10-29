CREATE TABLE "checkin_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"token" text NOT NULL,
	"booking_buffer_minutes" integer DEFAULT 90 NOT NULL,
	"minutes_per_party" integer DEFAULT 15 NOT NULL,
	"max_party_size" integer DEFAULT 10 NOT NULL,
	"max_wait_minutes" integer DEFAULT 180 NOT NULL,
	"venue_whatsapp" text,
	"shop_url" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"section_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_inr" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"created_date" text NOT NULL,
	"area_id" text,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" text
);
--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD COLUMN "source" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation_areas" ADD COLUMN "checkin_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_section_id_menu_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."menu_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_area_id_reservation_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."reservation_areas"("id") ON DELETE set null ON UPDATE no action;