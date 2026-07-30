import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export function generateRequestId(): string {
  return randomUUID();
}
