CREATE TYPE "public"."tally_period_granularity" AS ENUM('month', 'week');--> statement-breakpoint
CREATE TYPE "public"."tally_value_mode" AS ENUM('balance', 'period');--> statement-breakpoint
ALTER TABLE "tally_ledger_mappings" ADD COLUMN "value_mode" "tally_value_mode" DEFAULT 'balance' NOT NULL;--> statement-breakpoint
ALTER TABLE "tally_ledger_mappings" ADD COLUMN "period_granularity" "tally_period_granularity" DEFAULT 'month' NOT NULL;