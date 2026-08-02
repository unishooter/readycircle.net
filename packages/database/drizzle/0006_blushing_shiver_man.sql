CREATE TABLE "net_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "net_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"net_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"net_control_station_id" uuid,
	"notes" text,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "nets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"channel" text NOT NULL,
	"frequency" text NOT NULL,
	"first_occurs_on" date NOT NULL,
	"time_local" text NOT NULL,
	"timezone" text NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"procedure" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_plan_version_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "net_checkins" ADD CONSTRAINT "net_checkins_session_id_net_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."net_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_checkins" ADD CONSTRAINT "net_checkins_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_checkins" ADD CONSTRAINT "net_checkins_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_sessions" ADD CONSTRAINT "net_sessions_net_id_nets_id_fk" FOREIGN KEY ("net_id") REFERENCES "public"."nets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_sessions" ADD CONSTRAINT "net_sessions_net_control_station_id_stations_id_fk" FOREIGN KEY ("net_control_station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_sessions" ADD CONSTRAINT "net_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nets" ADD CONSTRAINT "nets_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nets" ADD CONSTRAINT "nets_source_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("source_plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nets" ADD CONSTRAINT "nets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "net_checkins_session_station_idx" ON "net_checkins" USING btree ("session_id","station_id");--> statement-breakpoint
CREATE INDEX "net_sessions_net_idx" ON "net_sessions" USING btree ("net_id");--> statement-breakpoint
CREATE INDEX "nets_circle_idx" ON "nets" USING btree ("circle_id");