-- Licence locations are now Kolkata, Jodhpur Park, Birbhum and All Locations.
-- Fold the old "Kolkata (Head Office)", "Kolkata (Sienna)", "Birbhum (Ceramics
-- Factory)" and "Birbhum (Other)" values into the new names. Anything else
-- (All Locations, free-typed values) is left as it is.
UPDATE "licences" SET "location" = 'Kolkata' WHERE "location" LIKE 'Kolkata (%)';--> statement-breakpoint
UPDATE "licences" SET "location" = 'Birbhum' WHERE "location" LIKE 'Birbhum (%)';
