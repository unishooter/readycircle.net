ALTER TABLE "contacts" ADD COLUMN "station_latitude" double precision;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "station_longitude" double precision;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "station_location_overridden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "counterparty_latitude" double precision;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "counterparty_longitude" double precision;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "counterparty_location_overridden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repeater_checks" ADD COLUMN "heard_station_id" uuid;--> statement-breakpoint
ALTER TABLE "repeater_checks" ADD COLUMN "station_latitude" double precision;--> statement-breakpoint
ALTER TABLE "repeater_checks" ADD COLUMN "station_longitude" double precision;--> statement-breakpoint
ALTER TABLE "repeater_checks" ADD COLUMN "station_location_overridden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repeater_checks" ADD CONSTRAINT "repeater_checks_heard_station_id_stations_id_fk" FOREIGN KEY ("heard_station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repeater_checks_heard_station_idx" ON "repeater_checks" USING btree ("heard_station_id");
