/** "Sun, Aug 2, 7:00 PM" in the viewer's local timezone. */
export function formatOccurrence(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
