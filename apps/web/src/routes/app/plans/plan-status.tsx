import { Badge } from '@readycircle/ui';
import type { PlanVersionSummary } from '@readycircle/contracts';

export function VersionStatusBadge({ version }: { version: PlanVersionSummary | null }) {
  if (!version) return <Badge tone="neutral">No versions</Badge>;
  switch (version.status) {
    case 'generating':
      return <Badge tone="amber">Generating…</Badge>;
    case 'draft':
      return <Badge tone="primary">Draft — ready for review</Badge>;
    case 'failed':
      return <Badge tone="red">Generation failed</Badge>;
    case 'published':
      return <Badge tone="primary">Published</Badge>;
    default:
      return <Badge tone="neutral">{version.status}</Badge>;
  }
}
