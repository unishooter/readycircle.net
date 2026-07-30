import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage.js';

const useSessionMock = vi.fn();
vi.mock('../../features/session/api.js', () => ({
  useSession: () => useSessionMock(),
  useDevUsers: () => ({ data: { items: [] }, isLoading: false }),
  useDevLogin: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('shows Google and email sign-in when Cognito is configured', () => {
    useSessionMock.mockReturnValue({
      data: { authenticated: false, user: null, devAuthEnabled: false, cognitoEnabled: true },
      isLoading: false,
    });
    renderAt('/login');

    expect(screen.getByRole('link', { name: /continue with google/i })).toHaveAttribute('href', '/api/v1/auth/google');
    expect(screen.getByRole('link', { name: /continue with email/i })).toHaveAttribute('href', '/api/v1/auth/login');
    expect(screen.queryByText(/development sign-in/i)).not.toBeInTheDocument();
  });

  it('shows the development picker when dev auth is enabled', () => {
    useSessionMock.mockReturnValue({
      data: { authenticated: false, user: null, devAuthEnabled: true, cognitoEnabled: false },
      isLoading: false,
    });
    renderAt('/login');

    expect(screen.getByText(/development sign-in/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /continue with google/i })).not.toBeInTheDocument();
  });

  it('shows a friendly message when an OAuth sign-in attempt failed', () => {
    useSessionMock.mockReturnValue({
      data: { authenticated: false, user: null, devAuthEnabled: false, cognitoEnabled: true },
      isLoading: false,
    });
    renderAt('/login?error=oauth_failed');

    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
  });

  it('shows a not-configured message when neither sign-in method is available', () => {
    useSessionMock.mockReturnValue({
      data: { authenticated: false, user: null, devAuthEnabled: false, cognitoEnabled: false },
      isLoading: false,
    });
    renderAt('/login');

    expect(screen.getByText(/sign-in is not configured/i)).toBeInTheDocument();
  });
});
