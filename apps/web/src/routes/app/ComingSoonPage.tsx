import { EmptyState } from '@readycircle/ui';

export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      title={`${title} is coming in a future milestone`}
      description={description}
    />
  );
}
