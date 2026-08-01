import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-4 text-center">
      <h1 className="text-3xl font-semibold text-ink">Page not found</h1>
      <p className="text-sm text-ink/60">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link to="/" className="text-sm font-medium text-navy-700 hover:text-navy-800">
        &larr; Back to home
      </Link>
    </div>
  );
}
