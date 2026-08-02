CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"counterparty_station_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"channel" text,
	"signal_rating" integer,
	"notes" text,
	"net_session_id" uuid,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_counterparty_station_id_stations_id_fk" FOREIGN KEY ("counterparty_station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_net_session_id_net_sessions_id_fk" FOREIGN KEY ("net_session_id") REFERENCES "public"."net_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "contacts_circle_idx" ON "contacts" USING btree ("circle_id");
--> statement-breakpoint
CREATE INDEX "contacts_station_idx" ON "contacts" USING btree ("station_id");
--> statement-breakpoint
CREATE INDEX "contacts_counterparty_idx" ON "contacts" USING btree ("counterparty_station_id");
