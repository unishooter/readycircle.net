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

/** Backs the Account page's zip-driven city/state autofill (US zip codes only). */
export const zipLookupParamsSchema = z.object({
  zip: z.string().regex(/^\d{5}$/, 'Enter a 5-digit zip code'),
});
export type ZipLookupParams = z.infer<typeof zipLookupParamsSchema>;

export const zipLookupResponseSchema = z.object({
  city: z.string(),
  state: z.string(),
});
export type ZipLookupResponse = z.infer<typeof zipLookupResponseSchema>;
