ALTER TABLE "users" ADD COLUMN "phone" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_visible_to_circle" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_visible_to_circle" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_visible_to_circle" boolean DEFAULT false NOT NULL;
