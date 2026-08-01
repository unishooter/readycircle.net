ALTER TABLE "plan_versions" DROP CONSTRAINT "plan_versions_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "plans_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_versions" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;