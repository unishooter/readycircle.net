import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '../../features/session/api.js';

export function RouteGuard() {
  const { data: session, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-ink/50">Loading…</p>
      </div>
    );
  }

  if (!session?.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
