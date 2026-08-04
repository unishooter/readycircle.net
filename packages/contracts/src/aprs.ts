import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * A member station's most recent APRS-derived position, surfaced on the
 * Circle's live map (`GET /circles/:circleId/aprs-positions`).
 *
 * Deliberately has no visibility gating -- unlike `stationLocationResponseSchema`,
 * every field here is shown to every active Circle member regardless of the
 * station's manual location `precision` setting. See
 * docs/decisions/0017-aprs-live-tracking.md: an APRS beacon is already
 * public over RF and on aprs.fi/findu.com, so gating it in-app wouldn't add
 * real protection and would just make the map wrong/confusing.
 */
export const aprsPositionResponseSchema = z.object({
  stationId: uuidSchema,
  stationName: z.string(),
  callsign: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  symbolTable: z.string(),
  symbolCode: z.string(),
  comment: z.string().nullable(),
  heardAt: z.string(),
});
export type AprsPositionResponse = z.infer<typeof aprsPositionResponseSchema>;
