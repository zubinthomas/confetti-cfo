ALTER TABLE "guest_sign_ins" ADD COLUMN "overdue_dismissed_at" text;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD COLUMN "overdue_dismissed_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "overdue_dismissed_at" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "overdue_dismissed_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "guest_sign_ins" ADD CONSTRAINT "guest_sign_ins_overdue_dismissed_by_user_id_users_id_fk" FOREIGN KEY ("overdue_dismissed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_overdue_dismissed_by_user_id_users_id_fk" FOREIGN KEY ("overdue_dismissed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;