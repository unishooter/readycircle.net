import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export function listResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({ items: z.array(itemSchema) });
}
