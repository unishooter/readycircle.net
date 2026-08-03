import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  geocodingSearchQuerySchema,
  geocodingSearchResponseSchema,
  zipLookupParamsSchema,
  zipLookupResponseSchema,
} from '@readycircle/contracts';
import { requireAuth } from '../../plugins/session.js';
import { NotFoundError } from '../../lib/errors.js';
import { searchPlaces } from './nominatim-client.js';
import { lookupUsZip } from './zippopotam-client.js';

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

  // Backs the Account page's zip-driven city/state autofill -- see
  // `zippopotam-client.ts`. A miss (unknown zip) or upstream failure both
  // surface as 404 so the client just falls back to manual entry.
  app.get(
    '/geocoding/zip/:zip',
    {
      schema: {
        tags: ['geocoding'],
        params: zipLookupParamsSchema,
        response: { 200: zipLookupResponseSchema },
      },
    },
    async (request) => {
      requireAuth(request);

      let result;
      try {
        result = await lookupUsZip(request.params.zip);
      } catch (error) {
        app.log.error({ err: error }, 'Zippopotam zip lookup failed');
        throw new NotFoundError('Zip code not found.');
      }
      if (!result) throw new NotFoundError('Zip code not found.');
      return result;
    },
  );
};
