import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CIRCLE_TYPE_LABELS,
  circleTypeSchema,
  type CircleResponse,
  type CircleType,
  type MemberSharingPolicy,
} from '@readycircle/contracts';
import { Button, Card, CardTitle, CheckboxOption, Field, Select, TextArea, TextInput } from '@readycircle/ui';
import { useCircle, useUpdateCircle } from '../../../features/circles/api.js';
import { CircleIdentifierBadge } from '../../../features/circles/CircleIdentifierBadge.js';

interface CircleDraft {
  circleType: CircleType;
  name: string;
  shortDescription: string;
  purpose: string;
  areaLabel: string;
  gridOrLocalityLabel: string;
  isPrivate: boolean;
  requiresApproval: boolean;
  memberSharingPolicy: MemberSharingPolicy;
}

function toDraft(circle: CircleResponse): CircleDraft {
  return {
    circleType: circle.circleType,
    name: circle.name,
    shortDescription: circle.shortDescription ?? '',
    purpose: circle.purpose ?? '',
    areaLabel: circle.area.areaLabel,
    gridOrLocalityLabel: circle.area.gridOrLocalityLabel ?? '',
    isPrivate: circle.isPrivate,
    requiresApproval: circle.requiresApproval,
    memberSharingPolicy: circle.memberSharingPolicy,
  };
}

/**
 * A single-page editor for a Circle's own settings, mirroring the station
 * editor's approach -- no need to force a coordinator back through the
 * sequential creation wizard just to change a name or privacy setting.
 */
export function CircleEditPage() {
  const { circleId } = useParams<{ circleId: string }>();
  const navigate = useNavigate();
  const { data: circle, isLoading, error } = useCircle(circleId);
  const updateCircle = useUpdateCircle(circleId ?? '');
  const [draft, setDraft] = useState<CircleDraft | null>(null);

  useEffect(() => {
    if (circle) setDraft(toDraft(circle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle?.id]);

  if (isLoading || !draft) return <p className="text-sm text-ink/50">Loading…</p>;
  if (error || !circle) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>Circle not found</CardTitle>
          <p className="mt-2 text-sm text-ink/60">
            This Circle doesn&apos;t exist, or you&apos;re not a member.
          </p>
          <Link to="/app/circles" className="mt-4 inline-block text-sm font-medium text-navy-700">
            &larr; Back to My Radio Circles
          </Link>
        </Card>
      </div>
    );
  }
  if (circle.viewerRole !== 'coordinator') {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>You can&apos;t edit this Circle</CardTitle>
          <p className="mt-2 text-sm text-ink/60">Only Circle coordinators can edit Circle settings.</p>
          <Link to={`/app/circles/${circle.id}`} className="mt-4 inline-block text-sm font-medium text-navy-700">
            &larr; Back to Circle
          </Link>
        </Card>
      </div>
    );
  }

  function patch(fields: Partial<CircleDraft>) {
    setDraft((current) => (current ? { ...current, ...fields } : current));
  }

  const canSubmit = draft.name.trim().length > 0 && draft.areaLabel.trim().length > 0;

  async function handleSave() {
    if (!draft) return;
    await updateCircle.mutateAsync({
      circleType: draft.circleType,
      name: draft.name.trim(),
      shortDescription: draft.shortDescription.trim() || undefined,
      purpose: draft.purpose.trim() || undefined,
      area: {
        areaLabel: draft.areaLabel.trim(),
        gridOrLocalityLabel: draft.gridOrLocalityLabel.trim() || undefined,
      },
      isPrivate: draft.isPrivate,
      requiresApproval: draft.requiresApproval,
      memberSharingPolicy: draft.memberSharingPolicy,
    });
    navigate(`/app/circles/${circleId}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">Edit {circle.name}</h1>
          <CircleIdentifierBadge identifier={circle.circleIdentifier} />
        </div>
        <p className="mt-1 text-sm text-ink/60">Changes save to this Circle immediately when you click Save.</p>
      </div>

      <Card>
        <CardTitle>Type</CardTitle>
        <div className="mt-4 space-y-3">
          {circleTypeSchema.options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/10 bg-white p-3 has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50"
            >
              <input
                type="radio"
                name="circleType"
                className="h-4 w-4 border-black/20 text-navy-700 focus:ring-navy-600"
                checked={draft.circleType === option}
                onChange={() => patch({ circleType: option })}
              />
              <span className="text-sm font-medium text-ink">{CIRCLE_TYPE_LABELS[option]}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Identity</CardTitle>
        <div className="mt-4 space-y-4">
          <Field label="Circle name" required>
            {(id) => <TextInput id={id} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />}
          </Field>
          <Field label="Short description" hint="A one-line summary, shown in listings.">
            {(id) => (
              <TextInput
                id={id}
                value={draft.shortDescription}
                onChange={(e) => patch({ shortDescription: e.target.value })}
              />
            )}
          </Field>
          <Field label="Purpose" hint="What is this Circle for?">
            {(id) => <TextArea id={id} value={draft.purpose} onChange={(e) => patch({ purpose: e.target.value })} />}
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Area</CardTitle>
        <div className="mt-4 space-y-4">
          <Field label="General area" required hint="A neighborhood, town, or region name.">
            {(id) => (
              <TextInput id={id} value={draft.areaLabel} onChange={(e) => patch({ areaLabel: e.target.value })} />
            )}
          </Field>
          <Field label="Grid or locality label" hint="Optional -- a grid square or locality name.">
            {(id) => (
              <TextInput
                id={id}
                value={draft.gridOrLocalityLabel}
                onChange={(e) => patch({ gridOrLocalityLabel: e.target.value })}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Membership &amp; privacy</CardTitle>
        <div className="mt-4 space-y-3">
          <CheckboxOption
            label="Private Circle"
            description="Only visible to members; not discoverable publicly."
            checked={draft.isPrivate}
            onChange={(e) => patch({ isPrivate: e.target.checked })}
          />
          <CheckboxOption
            label="Require coordinator approval to join"
            checked={draft.requiresApproval}
            onChange={(e) => patch({ requiresApproval: e.target.checked })}
          />
          <Field label="Member list visibility">
            {(id) => (
              <Select
                id={id}
                value={draft.memberSharingPolicy}
                onChange={(e) => patch({ memberSharingPolicy: e.target.value as CircleDraft['memberSharingPolicy'] })}
              >
                <option value="coordinators_only">Coordinators only can see full member list</option>
                <option value="all_members">All members can see the full member list</option>
              </Select>
            )}
          </Field>
        </div>
      </Card>

      {updateCircle.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {(updateCircle.error as Error).message}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => navigate(`/app/circles/${circleId}`)}>
          Cancel
        </Button>
        <Button onClick={() => void handleSave()} disabled={!canSubmit || updateCircle.isPending}>
          {updateCircle.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
