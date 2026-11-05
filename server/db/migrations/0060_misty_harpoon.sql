ALTER TABLE "petpooja_sales_orders" DROP CONSTRAINT "petpooja_sales_orders_petpooja_source_id_petpooja_sources_id_fk";
--> statement-breakpoint
ALTER TABLE "petpooja_sales_orders" ALTER COLUMN "petpooja_source_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "petpooja_sales_orders" ADD CONSTRAINT "petpooja_sales_orders_petpooja_source_id_petpooja_sources_id_fk" FOREIGN KEY ("petpooja_source_id") REFERENCES "public"."petpooja_sources"("id") ON DELETE set null ON UPDATE no action;