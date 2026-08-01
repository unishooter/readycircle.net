import type { HTMLAttributes } from 'react';
import { cx } from './cx.js';

export type BadgeTone = 'neutral' | 'primary' | 'amber' | 'red';

const toneStyles: Record<BadgeTone, string> = {
  neutral: 'bg-black/5 text-ink/80',
  primary: 'bg-navy-100 text-navy-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        toneStyles[tone],
        className,
      )}
      {...props}
    />
  );
}
