import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LandingPage } from './LandingPage.js';

describe('LandingPage', () => {
  it('renders the hero heading and a call to action to sign in', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: /log in/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
