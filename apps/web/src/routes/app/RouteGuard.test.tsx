import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RouteGuard } from './RouteGuard.js';

const useSessionMock = vi.fn();
vi.mock('../../features/session/api.js', () => ({
  useSession: () => useSessionMock(),
}));

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<RouteGuard />}>
          <Route path="/app" element={<div>Protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('RouteGuard', () => {
  it('shows a loading state while the session is resolving', () => {
    useSessionMock.mockReturnValue({ data: undefined, isLoading: true });
    renderGuard();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('redirects to /login when the session is not authenticated', () => {
    useSessionMock.mockReturnValue({ data: { authenticated: false, user: null }, isLoading: false });
    renderGuard();
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('renders protected content when authenticated', () => {
    useSessionMock.mockReturnValue({
      data: { authenticated: true, user: { id: '1', displayName: 'Jordan' } },
      isLoading: false,
    });
    renderGuard();
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
