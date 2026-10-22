-- The Reservations module is now Restaurant. Two things are stored by name and
-- would otherwise stop matching:
--   1. the permission resource string (permissions.resource);
--   2. layout ids in saved layouts: the nav item id and the page id are both
--      renamed 'reservations' -> 'restaurant'.
-- Runs inside migrate(), before the permission catalog is seeded at boot, so the
-- rename lands before the seeder could add new Restaurant rows next to the old
-- ones. Every grant, deny, invite and permission layout points at
-- permissions.id, so they all survive the in-place rename.
UPDATE "permissions" SET "resource" = 'Restaurant'
WHERE "resource" = 'Reservation'
  AND NOT EXISTS (
    SELECT 1 FROM "permissions" p2 WHERE p2."resource" = 'Restaurant' AND p2."action" = "permissions"."action"
  );--> statement-breakpoint
CREATE FUNCTION pg_temp.rename_reservations_in_layout(cfg jsonb) RETURNS jsonb AS $fn$
DECLARE
  out jsonb := cfg;
  lst text;
BEGIN
  IF out #> '{nav,items,reservations}' IS NOT NULL THEN
    out := jsonb_set(out #- '{nav,items,reservations}', '{nav,items,restaurant}', out #> '{nav,items,reservations}');
  END IF;
  FOREACH lst IN ARRAY ARRAY['sidebar', 'header', 'userMenu'] LOOP
    IF jsonb_typeof(out #> ARRAY['nav', 'order', lst]) = 'array' THEN
      out := jsonb_set(
        out, ARRAY['nav', 'order', lst],
        (SELECT COALESCE(jsonb_agg(CASE WHEN e = '"reservations"'::jsonb THEN '"restaurant"'::jsonb ELSE e END ORDER BY ord), '[]'::jsonb)
         FROM jsonb_array_elements(out #> ARRAY['nav', 'order', lst]) WITH ORDINALITY AS t(e, ord))
      );
    END IF;
  END LOOP;
  IF out #> '{tabs,reservations}' IS NOT NULL THEN
    out := jsonb_set(out #- '{tabs,reservations}', '{tabs,restaurant}', out #> '{tabs,reservations}');
  END IF;
  RETURN out;
END;
$fn$ LANGUAGE plpgsql;--> statement-breakpoint
UPDATE "user_layouts" SET "config" = pg_temp.rename_reservations_in_layout("config") WHERE "config"::text LIKE '%reservations%';--> statement-breakpoint
UPDATE "role_layouts" SET "config" = pg_temp.rename_reservations_in_layout("config") WHERE "config"::text LIKE '%reservations%';--> statement-breakpoint
UPDATE "permission_layouts" SET "config" = pg_temp.rename_reservations_in_layout("config") WHERE "config"::text LIKE '%reservations%';
