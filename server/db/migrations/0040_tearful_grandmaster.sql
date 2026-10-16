ALTER TABLE "periods" ADD COLUMN "reconciled_at" text;--> statement-breakpoint
ALTER TABLE "periods" ADD COLUMN "reconciled_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_reconciled_by_user_id_users_id_fk" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;