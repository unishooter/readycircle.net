import { z } from 'zod';

export const geocodingSearchQuerySchema = z.object({
  q: z.string().min(2).max(200),
});
export type GeocodingSearchQuery = z.infer<typeof geocodingSearchQuerySchema>;

export const geocodingResultSchema = z.object({
  label: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type GeocodingResult = z.infer<typeof geocodingResultSchema>;

export const geocodingSearchResponseSchema = z.object({
  results: z.array(geocodingResultSchema),
});
export type GeocodingSearchResponse = z.infer<typeof geocodingSearchResponseSchema>;
