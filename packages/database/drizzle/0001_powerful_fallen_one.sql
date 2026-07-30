ALTER TABLE "circle_role_assignments" DROP CONSTRAINT "circle_role_assignments_assigned_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "circles" DROP CONSTRAINT "circles_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "circles" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "circle_role_assignments" ADD CONSTRAINT "circle_role_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;