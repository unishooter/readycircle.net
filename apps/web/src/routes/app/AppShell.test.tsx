import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell.js';

vi.mock('../../features/session/api.js', () => ({
  useSession: () => ({ data: { authenticated: true, user: { id: '1', displayName: 'Jordan Lee' } } }),
  useLogout: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('AppShell', () => {
  it('renders the primary navigation and the signed-in user', () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<div>Dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my stations/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my radio circles/i })).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });
});
