ALTER TABLE "licences" RENAME COLUMN "annual_fee" TO "fee_amount";--> statement-breakpoint
ALTER TABLE "licences" ADD COLUMN "fee_interval" text DEFAULT 'annual' NOT NULL;