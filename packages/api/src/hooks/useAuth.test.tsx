import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureTokenStore, noopTokenStore } from '@/token-store';
import { useAuthStore } from '@/stores/auth.store';
import { setAuthFlowNavigation, useLogin } from './useAuth';
import { login } from '@/api/auth.api';

vi.mock('@/api/auth.api', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const afterLogin = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ token: null, user: null, refreshing: false });
  setAuthFlowNavigation({ afterLogin, afterRegister: vi.fn(), onLoggedOut: vi.fn() });
  vi.mocked(login).mockResolvedValue({
    accessToken: 'at',
    refreshToken: 'rt',
    user: { id: 'u' },
  } as Awaited<ReturnType<typeof login>>);
});
afterEach(() => {
  configureTokenStore(noopTokenStore);
  useAuthStore.setState({ token: null, user: null, refreshing: false });
});

describe('login persistence', () => {
  it('keeps login pending until native storage commits, then navigates', async () => {
    let commit!: () => void;
    const saved = new Promise<void>((resolve) => {
      commit = resolve;
    });
    const persist = vi.fn(() => saved);
    configureTokenStore({ ...noopTokenStore, setTokens: persist });
    const { result } = renderHook(() => useLogin(), { wrapper });
    act(() => result.current.mutate({ email: 'a@example.test', password: 'password' }));
    await waitFor(() => expect(persist).toHaveBeenCalledWith('at', 'rt'));
    expect(result.current.isPending).toBe(true);
    expect(afterLogin).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
    await act(async () => {
      commit();
      await saved;
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(afterLogin).toHaveBeenCalledTimes(1);
  });

  it('routes persistence errors through the login error callback', async () => {
    configureTokenStore({
      ...noopTokenStore,
      setTokens: async () => {
        throw new Error('Cannot save session');
      },
    });
    const onError = vi.fn();
    const { result } = renderHook(() => useLogin(), { wrapper });
    act(() =>
      result.current.mutate({ email: 'a@example.test', password: 'password' }, { onError }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onError).toHaveBeenCalled();
    expect(afterLogin).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });
});
