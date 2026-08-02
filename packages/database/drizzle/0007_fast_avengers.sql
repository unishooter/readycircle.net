CREATE TABLE "repeaters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"service" text NOT NULL,
	"name" text NOT NULL,
	"callsign" text,
	"output_frequency_mhz" double precision NOT NULL,
	"offset_or_input" text,
	"tone" text,
	"latitude" double precision,
	"longitude" double precision,
	"geog" geography(Point,4326),
	"area_label" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_repeaters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"repeater_id" uuid NOT NULL,
	"access" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "transmit_power_watts" integer;--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "antenna_type" text;--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "antenna_height_feet" integer;--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "backup_power" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD COLUMN "scenario" jsonb;--> statement-breakpoint
ALTER TABLE "repeaters" ADD CONSTRAINT "repeaters_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repeaters" ADD CONSTRAINT "repeaters_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_repeaters" ADD CONSTRAINT "station_repeaters_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_repeaters" ADD CONSTRAINT "station_repeaters_repeater_id_repeaters_id_fk" FOREIGN KEY ("repeater_id") REFERENCES "public"."repeaters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repeaters_circle_idx" ON "repeaters" USING btree ("circle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repeaters_circle_external_idx" ON "repeaters" USING btree ("circle_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "station_repeaters_station_repeater_idx" ON "station_repeaters" USING btree ("station_id","repeater_id");