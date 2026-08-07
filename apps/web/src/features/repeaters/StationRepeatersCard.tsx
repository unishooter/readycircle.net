import { useEffect, useMemo, useState } from 'react';
import { REPEATER_SERVICE_LABELS, type RepeaterAccess } from '@readycircle/contracts';
import { Button, Card, CardTitle } from '@readycircle/ui';
import { useAvailableRepeaters, useSetStationRepeaters, useStationRepeaterLinks } from './api.js';

export interface StationRepeatersCardProps {
  stationId: string;
}

const ACCESS_CHOICES: { value: RepeaterAccess | 'none'; label: string }[] = [
  { value: 'none', label: 'No' },
  { value: 'rx', label: 'Hear only' },
  { value: 'rx_tx', label: 'Hear + transmit' },
];

/**
 * Per-repeater RX/TX declaration for a station, listing every repeater in
 * the station's Circles. Saved separately from the main station form --
 * links are their own resource with replace semantics.
 */
export function StationRepeatersCard({ stationId }: StationRepeatersCardProps) {
  const { data: options, isLoading: optionsLoading } = useAvailableRepeaters(stationId);
  const { data: links, isLoading: linksLoading } = useStationRepeaterLinks(stationId);
  const setLinks = useSetStationRepeaters(stationId);

  const [accessById, setAccessById] = useState<Record<string, RepeaterAccess | 'none'>>({});
  const [dirty, setDirty] = useState(false);

  const serverAccessById = useMemo(() => {
    const map: Record<string, RepeaterAccess | 'none'> = {};
    for (const link of links?.items ?? []) map[link.repeaterId] = link.access;
    return map;
  }, [links]);

  useEffect(() => {
    setAccessById(serverAccessById);
    setDirty(false);
  }, [serverAccessById]);

  if (optionsLoading || linksLoading) {
    return (
      <Card>
        <CardTitle>Repeater access</CardTitle>
        <p className="mt-2 text-sm text-ink/50">Loading…</p>
      </Card>
    );
  }

  const items = options?.items ?? [];
  if (items.length === 0) {
    return (
      <Card>
        <CardTitle>Repeater access</CardTitle>
        <p className="mt-2 text-sm text-ink/60">
          None of this station&apos;s Circles list repeaters yet. Add repeaters from a Circle page, then declare
          which ones this station can hear or key up.
        </p>
      </Card>
    );
  }

  function setAccess(repeaterId: string, value: RepeaterAccess | 'none') {
    setAccessById((current) => ({ ...current, [repeaterId]: value }));
    setDirty(true);
  }

  async function handleSave() {
    const linksToSave = Object.entries(accessById)
      .filter((entry): entry is [string, RepeaterAccess] => entry[1] !== 'none')
      .map(([repeaterId, access]) => ({ repeaterId, access }));
    await setLinks.mutateAsync({ links: linksToSave });
    setDirty(false);
  }

  return (
    <Card>
      <CardTitle>Repeater access</CardTitle>
      <p className="mt-2 text-sm text-ink/60">
        Which repeaters can this station actually use? &quot;Hear + transmit&quot; means you can bring the
        repeater up, not just receive it. Logging a check from a Circle&apos;s Repeaters card also
        updates these links. This feeds the coverage analysis in generated plans.
      </p>
      <ul className="mt-4 divide-y divide-black/5">
        {items.map((option) => (
          <li key={option.repeaterId} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-sm font-medium text-ink">{option.name}</p>
              <p className="text-xs text-ink/60">
                {[
                  REPEATER_SERVICE_LABELS[option.service],
                  `${option.outputFrequencyMhz.toFixed(4)} MHz`,
                  option.tone ? `tone ${option.tone}` : null,
                  option.circleName,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label={`Access to ${option.name}`}>
              {ACCESS_CHOICES.map((choice) => {
                const selected = (accessById[option.repeaterId] ?? 'none') === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAccess(option.repeaterId, choice.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      selected ? 'bg-navy-700 text-white' : 'bg-black/5 text-ink/70 hover:bg-black/10'
                    }`}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {setLinks.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {(setLinks.error as Error).message}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button onClick={() => void handleSave()} disabled={!dirty || setLinks.isPending}>
          {setLinks.isPending ? 'Saving…' : 'Save repeater access'}
        </Button>
      </div>
    </Card>
  );
}
