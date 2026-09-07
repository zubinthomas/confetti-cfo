-- Enforce "a table holds at most one active reservation per overlapping time
-- window" at the database, not just in server/db/reservations.ts. The app-level
-- check is a read-then-write with no lock, so two concurrent bookings for the
-- same slot could both pass it; this EXCLUDE constraint closes that race and
-- also catches conflicting status changes (e.g. reactivating a cancelled row).
CREATE EXTENSION IF NOT EXISTS "btree_gist";
--> statement-breakpoint
-- date/time are stored as text ('YYYY-MM-DD' / 'HH:MM'); the input casts are
-- only STABLE (they accept 'now', 'today', ...), so they can't appear directly
-- in an index expression. These CHECK constraints guarantee the columns hold
-- strict literal values, which makes wrapping the arithmetic in an IMMUTABLE
-- function below sound.
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_date_format" CHECK ("date" ~ '^\d{4}-\d{2}-\d{2}$');
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_time_format" CHECK ("time" ~ '^\d{2}:\d{2}$');
--> statement-breakpoint
CREATE FUNCTION "reservation_span"("d" text, "t" text, "dur" integer) RETURNS tsrange
	LANGUAGE sql IMMUTABLE PARALLEL SAFE
	AS $$ SELECT tsrange(
		("d" || ' ' || "t")::timestamp,
		("d" || ' ' || "t")::timestamp + make_interval(mins => "dur"),
		'[)'
	) $$;
--> statement-breakpoint
-- Partial, matching INACTIVE_STATUSES in server/db/reservations.ts: cancelled
-- and no_show rows are exempt, so they neither block nor collide.
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_table_overlap" EXCLUDE USING gist (
	"table_id" WITH =,
	"reservation_span"("date", "time", "duration_minutes") WITH &&
) WHERE ("status" <> 'cancelled' AND "status" <> 'no_show');
