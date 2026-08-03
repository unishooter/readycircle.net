import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CircleIdentifierBadge } from './CircleIdentifierBadge.js';

describe('CircleIdentifierBadge', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  it('renders the identifier in full variant with a copy button', () => {
    render(<CircleIdentifierBadge identifier="RAV7" />);
    expect(screen.getByText('Circle Identifier')).toBeInTheDocument();
    expect(screen.getByText('RAV7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy circle identifier rav7/i })).toBeInTheDocument();
  });

  it('copies the identifier to the clipboard and shows "Copied!" feedback', async () => {
    render(<CircleIdentifierBadge identifier="RAV7" />);

    fireEvent.click(screen.getByRole('button', { name: /copy circle identifier rav7/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('RAV7'));
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
  });

  it('renders compact "Circle ID:" text with no copy button', () => {
    render(<CircleIdentifierBadge identifier="RAV7" compact />);
    expect(screen.getByText('Circle ID:')).toBeInTheDocument();
    expect(screen.getByText('RAV7')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
