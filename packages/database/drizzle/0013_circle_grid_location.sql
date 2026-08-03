ALTER TABLE "circles" ADD COLUMN "grid_identifier" text;
--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "grid_latitude" double precision;
--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "grid_longitude" double precision;
--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "grid_geog" geography(Point,4326);
--> statement-breakpoint
CREATE INDEX "circles_grid_geog_idx" ON "circles" USING gist ("grid_geog");
