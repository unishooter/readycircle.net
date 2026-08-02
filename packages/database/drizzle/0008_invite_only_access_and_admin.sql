CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "circle_invitations" DROP CONSTRAINT "circle_invitations_invited_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "circle_invitations_token_idx";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_invitations" ADD COLUMN "type" text DEFAULT 'circle_join' NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_invitations" ADD COLUMN "accepted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "circle_invitations" ADD COLUMN "accepted_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "circle_invitations" ADD COLUMN "revoked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "circle_invitations" ADD COLUMN "revoked_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "circle_invitations" RENAME COLUMN "token" TO "token_hash";
--> statement-breakpoint
ALTER TABLE "circle_invitations" ALTER COLUMN "token_hash" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_invitations" ALTER COLUMN "expires_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_invitations" DROP COLUMN "invited_user_id";
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "circle_invitations" ADD CONSTRAINT "circle_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "circle_invitations" ADD CONSTRAINT "circle_invitations_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "circle_invitations_token_hash_idx" ON "circle_invitations" USING btree ("token_hash");
--> statement-breakpoint
UPDATE "users" SET "is_admin" = true;
