ALTER TABLE "circles" ADD COLUMN "circle_identifier" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "circles_circle_identifier_idx" ON "circles" USING btree ("circle_identifier");
