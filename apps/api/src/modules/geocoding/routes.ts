import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { geocodingSearchQuerySchema, geocodingSearchResponseSchema } from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { searchPlaces } from './nominatim-client.js';

/**
 * Backs the "broad area" (zip/city/county/state) location search used when
 * creating or editing a station. Behind auth like the rest of the app's
 * routes -- there's no product reason to expose free geocoding to
 * unauthenticated callers.
 */
export const geocodingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/geocoding/search',
    {
      schema: {
        tags: ['geocoding'],
        querystring: geocodingSearchQuerySchema,
        response: { 200: geocodingSearchResponseSchema },
      },
    },
    async (request) => {
      requireAuth(request);

      try {
        const results = await searchPlaces(request.query.q, {
          contactEmail: app.config.geocoding.contactEmail,
        });
        return {
          results: results.map((result) => ({
            label: result.display_name,
            latitude: Number(result.lat),
            longitude: Number(result.lon),
          })),
        };
      } catch (error) {
        // This is a search-as-you-type convenience, not a critical path --
        // degrade to an empty result set on a transient upstream failure
        // rather than surfacing an error banner mid-typing. Logged so real
        // problems (e.g. a policy-triggered block) are still visible.
        app.log.error({ err: error }, 'Nominatim geocoding search failed');
        return { results: [] };
      }
    },
  );
};
