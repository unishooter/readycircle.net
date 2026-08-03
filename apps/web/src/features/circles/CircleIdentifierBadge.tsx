import { useState } from 'react';
import { Button } from '@readycircle/ui';

interface CircleIdentifierBadgeProps {
  identifier: string;
  /** Compact: just "Circle ID: RAV7" text, no copy button -- for dense list rows. */
  compact?: boolean;
}

/**
 * Displays the Circle's short, human-readable public identifier (see
 * `circles.circleIdentifier` in packages/database for why this is never
 * the same as the circle's internal database ID). Display-only -- there is
 * no way to edit it from here.
 */
export function CircleIdentifierBadge({ identifier, compact = false }: CircleIdentifierBadgeProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(identifier);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (e.g. insecure context); the identifier is still visible for manual copy.
    }
  }

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-ink/70">
        <span className="uppercase tracking-wide text-ink/40">Circle ID:</span>
        <span className="font-mono tracking-wider">{identifier}</span>
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-navy-50/60 px-3 py-1.5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Circle Identifier</p>
        <p className="font-mono text-base font-semibold tracking-widest text-navy-800">{identifier}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void handleCopy()}
        aria-label={`Copy Circle Identifier ${identifier}`}
      >
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
  );
}
