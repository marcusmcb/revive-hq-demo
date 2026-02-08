import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Home from '../src/app/page';

vi.mock('../src/lib/api', () => {
  return {
    runSearch: vi.fn()
  };
});

import { runSearch } from '../src/lib/api';

describe('Home page', () => {
  it('hides Results header before searching', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /property search/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^results$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/0 listing\(s\)/i)).not.toBeInTheDocument();
  });

  it('shows Searching… while request is in-flight, then shows Results and count', async () => {
    const user = userEvent.setup();

    const deferred: { resolve: (v: any) => void; reject: (e: any) => void } = {
      resolve: () => undefined,
      reject: () => undefined
    };
    const promise = new Promise((resolve, reject) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
    });

    vi.mocked(runSearch).mockReturnValueOnce(promise as any);

    render(<Home />);

    await user.type(screen.getByLabelText(/^city$/i), 'Nashville');
    await user.type(screen.getByLabelText(/^state$/i), 'TN');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(screen.getByRole('heading', { name: /searching/i })).toBeInTheDocument();

    deferred.resolve({
      searchId: 'search_1',
      properties: [
        {
          source: 'repliers',
          sourceId: '1',
          address: '1 Test St, Nashville, TN 37201',
          price: 500000,
          beds: 3,
          baths: 2,
          sqft: 1500,
          photos: []
        }
      ]
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^results$/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/1 listing\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 test st/i)).toBeInTheDocument();
  });

  it('Clear Search does not change the current mode', async () => {
    const user = userEvent.setup();
    vi.mocked(runSearch).mockResolvedValueOnce({ searchId: 'search_1', properties: [] } as any);

    render(<Home />);

    await user.click(screen.getByRole('button', { name: /single address/i }));
    expect(screen.getByRole('button', { name: /single address/i })).toHaveAttribute('aria-pressed', 'true');

    await user.type(screen.getByLabelText(/^address$/i), '123 Main St, Austin, TX 78701');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^results$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /clear search/i }));

    // Mode should remain 'address'
    expect(screen.getByRole('button', { name: /single address/i })).toHaveAttribute('aria-pressed', 'true');
    // Input should be cleared
    expect(screen.getByLabelText(/^address$/i)).toHaveValue('');
  });
});
