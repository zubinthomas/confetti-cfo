-- The Restaurant module is now three permission resources: Restaurant (opening
-- the module and the Locations & Tables catalog), Reservation (bookings) and
-- GuestRegister (sign-ins). Until now all of it was Restaurant:read/write/delete.
-- To keep everyone's access exactly as it was, every holder of Restaurant:<action>
-- (role, direct user grant or deny, pending invite) is copied to
-- Reservation:<action> and GuestRegister:<action> with the same effect.
-- Admins then trim per role. The permission rows are created here because the
-- catalog seeder only runs after migrate(). Idempotent: every insert is
-- ON CONFLICT DO NOTHING. Permission layouts are left alone, since holders keep
-- Restaurant:read.
INSERT INTO "permissions" ("resource", "action")
SELECT r.resource, a.action
FROM (VALUES ('Reservation'), ('GuestRegister')) AS r(resource)
CROSS JOIN (VALUES ('read'), ('write'), ('delete')) AS a(action)
ON CONFLICT ("resource", "action") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id", "effect")
SELECT rp."role_id", np."id", rp."effect"
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."resource" = 'Restaurant'
JOIN "permissions" np ON np."action" = op."action" AND np."resource" IN ('Reservation', 'GuestRegister')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "user_permissions" ("user_id", "permission_id", "effect")
SELECT up."user_id", np."id", up."effect"
FROM "user_permissions" up
JOIN "permissions" op ON op."id" = up."permission_id" AND op."resource" = 'Restaurant'
JOIN "permissions" np ON np."action" = op."action" AND np."resource" IN ('Reservation', 'GuestRegister')
ON CONFLICT ("user_id", "permission_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "invite_permissions" ("invite_id", "permission_id")
SELECT ip."invite_id", np."id"
FROM "invite_permissions" ip
JOIN "permissions" op ON op."id" = ip."permission_id" AND op."resource" = 'Restaurant'
JOIN "permissions" np ON np."action" = op."action" AND np."resource" IN ('Reservation', 'GuestRegister')
ON CONFLICT ("invite_id", "permission_id") DO NOTHING;
