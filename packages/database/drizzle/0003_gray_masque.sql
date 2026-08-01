CREATE TABLE "plan_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"format" text DEFAULT 'pdf' NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text DEFAULT 'application/pdf' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "plan_versions" ADD COLUMN "context_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "plan_documents" ADD CONSTRAINT "plan_documents_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_documents_version_format_idx" ON "plan_documents" USING btree ("plan_version_id","format");