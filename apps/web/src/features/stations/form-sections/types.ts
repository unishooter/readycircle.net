import type { CreateStationInput } from '@readycircle/contracts';

/**
 * Shared shape for the station create wizard and the full-page editor --
 * both build up a value of this shape (with the wizard sequencing through
 * it step by step, and the editor showing every section at once) and submit
 * it via `useCreateStation` / `useUpdateStation` respectively.
 */
export type StationFormDraft = CreateStationInput;
