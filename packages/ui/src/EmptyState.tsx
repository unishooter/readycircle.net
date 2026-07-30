import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-black/15 bg-white/60 px-6 py-12 text-center">
      {icon ? <div className="text-teal-700">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-ink/60">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
