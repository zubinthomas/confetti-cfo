CREATE TABLE "table_merge_links" (
	"table_a_id" text NOT NULL,
	"table_b_id" text NOT NULL,
	CONSTRAINT "table_merge_links_table_a_id_table_b_id_pk" PRIMARY KEY("table_a_id","table_b_id")
);
--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD COLUMN "free_merge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "table_merge_links" ADD CONSTRAINT "table_merge_links_table_a_id_reservation_tables_id_fk" FOREIGN KEY ("table_a_id") REFERENCES "public"."reservation_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_merge_links" ADD CONSTRAINT "table_merge_links_table_b_id_reservation_tables_id_fk" FOREIGN KEY ("table_b_id") REFERENCES "public"."reservation_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-added (drizzle-kit doesn't emit CHECK): keep one row per undirected
-- pair. App code inserts [a, b].sort()ed; this makes the ordering a DB
-- invariant so a future path that forgets to sort can't create a mirror row,
-- and a < a being false rejects self-links for free.
ALTER TABLE "table_merge_links" ADD CONSTRAINT "table_merge_links_ordered" CHECK ("table_a_id" < "table_b_id");