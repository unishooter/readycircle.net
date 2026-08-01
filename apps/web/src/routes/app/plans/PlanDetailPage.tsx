import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  PLAN_GENERATION_STAGE_LABELS,
  PLAN_GENERATION_STAGE_ORDER,
  type PlanGenerationStage,
} from '@readycircle/contracts';
import { Button, Card, CardTitle, cx } from '@readycircle/ui';
import { usePlan, usePlanVersion, usePublishVersion, useRegeneratePlan, planDocumentUrl } from '../../../features/plans/api.js';
import { PlanSectionView } from './PlanSections.js';
import { VersionStatusBadge } from './plan-status.js';

export function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const { data: plan, isLoading, error } = usePlan(planId);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const publish = usePublishVersion(planId ?? '');
  const regenerate = useRegeneratePlan(planId ?? '');

  // Default to the newest version; an explicit selection sticks until the
  // user regenerates (which resets to follow the new latest version).
  const versions = plan?.versions ?? [];
  const effectiveVersionId = selectedVersionId ?? versions[0]?.id;
  const { data: version } = usePlanVersion(planId, effectiveVersionId);

  if (isLoading) return <p className="text-sm text-ink/50">Loading…</p>;
  if (error || !plan) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardTitle>Plan not found</CardTitle>
          <p className="mt-2 text-sm text-ink/60">
            This plan doesn&apos;t exist, or you&apos;re not a member of its Radio Circle.
          </p>
          <Link to="/app/plans" className="mt-4 inline-block text-sm font-medium text-navy-700">
            &larr; Back to Plans
          </Link>
        </Card>
      </div>
    );
  }

  const canManage = plan.viewerCanManage;
  const anyGenerating = versions.some((v) => v.status === 'generating');

  async function handleRegenerate() {
    await regenerate.mutateAsync();
    setSelectedVersionId(null);
  }

  async function handlePublish() {
    if (!effectiveVersionId) return;
    await publish.mutateAsync(effectiveVersionId);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs text-ink/50">
          <Link to="/app/plans" className="hover:text-navy-700">
            Plans
          </Link>{' '}
          / <Link to={`/app/circles/${plan.circleId}`} className="hover:text-navy-700">{plan.circleName}</Link>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">{plan.title}</h1>
          <VersionStatusBadge version={version ?? versions.find((v) => v.id === effectiveVersionId) ?? null} />
        </div>
      </div>

      {versions.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink/50">Versions:</span>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedVersionId(v.id)}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                v.id === effectiveVersionId
                  ? 'bg-navy-700 text-white'
                  : 'bg-black/5 text-ink/70 hover:bg-black/10',
              )}
            >
              v{v.versionNumber}
              {v.status === 'published' ? ' ✓' : v.status === 'failed' ? ' ✕' : ''}
            </button>
          ))}
        </div>
      ) : null}

      {version?.status === 'generating' ? (
        <Card>
          <div className="flex items-center gap-3">
            <Spinner className="h-5 w-5 text-navy-700" />
            <CardTitle>Generating your plan…</CardTitle>
          </div>
          <GenerationProgress stage={version.generationStage} />
          <p className="mt-4 text-xs text-ink/50">
            This usually takes under a minute. The page updates automatically -- no need to refresh.
          </p>
        </Card>
      ) : null}

      {version?.status === 'failed' ? (
        <Card className="border-red-200 bg-red-50/50">
          <CardTitle>Generation failed</CardTitle>
          <p role="alert" className="mt-2 text-sm text-red-800">
            {version.errorMessage ?? 'Something went wrong while generating this version.'}
          </p>
          {canManage ? (
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => void handleRegenerate()}
              disabled={regenerate.isPending || anyGenerating}
            >
              Try again
            </Button>
          ) : null}
        </Card>
      ) : null}

      {version && (version.status === 'draft' || version.status === 'published') ? (
        <>
          <Card className="border-navy-200 bg-navy-50/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  Version {version.versionNumber}
                  {version.publishedAt
                    ? ` · Published ${new Date(version.publishedAt).toLocaleDateString()}`
                    : ' · Draft'}
                </p>
                <p className="mt-0.5 text-xs text-ink/60">
                  {version.status === 'draft'
                    ? 'Review the sections below, then publish to lock this version and produce the printable PDF.'
                    : 'Published versions are immutable. Regenerate to draft a new version with current Circle data.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {version.status === 'published' ? <DocumentAction planId={plan.id} version={version} /> : null}
                {canManage && version.status === 'draft' ? (
                  <Button onClick={() => void handlePublish()} disabled={publish.isPending}>
                    Publish
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    variant="secondary"
                    onClick={() => void handleRegenerate()}
                    disabled={regenerate.isPending || anyGenerating}
                  >
                    Regenerate
                  </Button>
                ) : null}
              </div>
            </div>
            {publish.isError ? (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {(publish.error as Error).message}
              </p>
            ) : null}
            {regenerate.isError ? (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {(regenerate.error as Error).message}
              </p>
            ) : null}
          </Card>

          {version.sections.map((section) => (
            <PlanSectionView key={section.sectionKey} section={section} />
          ))}
        </>
      ) : null}
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/**
 * Live step checklist while a version generates. The stage comes from the
 * polled version row; before the job is picked up it is null, in which case
 * the first step is shown as active (the pickup gap is normally seconds).
 */
function GenerationProgress({ stage }: { stage: PlanGenerationStage | null }) {
  const currentIndex = stage ? PLAN_GENERATION_STAGE_ORDER.indexOf(stage) : 0;

  return (
    <ol className="mt-4 space-y-2.5">
      {PLAN_GENERATION_STAGE_ORDER.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'upcoming';
        return (
          <li key={step} className="flex items-center gap-2.5 text-sm">
            {state === 'done' ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-navy-700 text-[10px] font-bold text-white">
                ✓
              </span>
            ) : state === 'active' ? (
              <Spinner className="h-4 w-4 text-navy-700" />
            ) : (
              <span className="h-4 w-4 rounded-full border-2 border-black/15" />
            )}
            <span className={cx(state === 'upcoming' ? 'text-ink/40' : 'text-ink/80', state === 'active' && 'font-medium')}>
              {PLAN_GENERATION_STAGE_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function DocumentAction({ planId, version }: { planId: string; version: { id: string; document: { status: string; errorMessage: string | null } | null } }) {
  if (!version.document || version.document.status === 'pending') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-ink/60">
        <Spinner className="h-3.5 w-3.5 text-ink/50" />
        Preparing PDF…
      </span>
    );
  }
  if (version.document.status === 'failed') {
    return (
      <span role="alert" className="text-xs text-red-700">
        PDF failed: {version.document.errorMessage ?? 'unknown error'}
      </span>
    );
  }
  return (
    <a href={planDocumentUrl(planId, version.id)} download>
      <Button variant="secondary">Download PDF</Button>
    </a>
  );
}
