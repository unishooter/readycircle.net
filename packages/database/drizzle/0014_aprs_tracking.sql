ALTER TABLE "stations" ADD COLUMN "callsign" text;
--> statement-breakpoint
CREATE TABLE "station_aprs_positions" (
	"station_id" uuid PRIMARY KEY NOT NULL,
	"source_callsign" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"geog" geography(Point,4326),
	"symbol_table" text NOT NULL,
	"symbol_code" text NOT NULL,
	"comment" text,
	"heard_at" timestamp with time zone NOT NULL,
	"raw_packet" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "station_aprs_positions" ADD CONSTRAINT "station_aprs_positions_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "station_aprs_positions_geog_gist_idx" ON "station_aprs_positions" USING gist ("geog");
