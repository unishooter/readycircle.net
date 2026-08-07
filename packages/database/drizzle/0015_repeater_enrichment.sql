ALTER TABLE "contacts" ADD COLUMN "repeater_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_repeater_id_repeaters_id_fk" FOREIGN KEY ("repeater_id") REFERENCES "public"."repeaters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_repeater_idx" ON "contacts" USING btree ("repeater_id");--> statement-breakpoint
CREATE TABLE "repeater_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"repeater_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"access" text NOT NULL,
	"counterparty_note" text,
	"signal_rating" integer,
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repeater_checks" ADD CONSTRAINT "repeater_checks_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repeater_checks" ADD CONSTRAINT "repeater_checks_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repeater_checks" ADD CONSTRAINT "repeater_checks_repeater_id_repeaters_id_fk" FOREIGN KEY ("repeater_id") REFERENCES "public"."repeaters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repeater_checks" ADD CONSTRAINT "repeater_checks_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "repeater_checks_circle_idx" ON "repeater_checks" USING btree ("circle_id");
--> statement-breakpoint
CREATE INDEX "repeater_checks_station_idx" ON "repeater_checks" USING btree ("station_id");
--> statement-breakpoint
CREATE INDEX "repeater_checks_repeater_idx" ON "repeater_checks" USING btree ("repeater_id");
