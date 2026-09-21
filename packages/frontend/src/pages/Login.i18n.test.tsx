import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import Login from '@/pages/Login';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

describe('Login i18n smoke', () => {
  it('renders translated text, not raw keys', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // If i18n fails, the raw keys ("auth:email" etc.) appear as
    // literal text instead of translations.
    expect(screen.queryAllByText(/auth:/)).toEqual([]);
    // The submit button should show a real translation.
    expect(
      screen.getByRole('button', { name: /^(登录|Log in|Login)$/ }),
    ).toBeDefined();
  });
});
