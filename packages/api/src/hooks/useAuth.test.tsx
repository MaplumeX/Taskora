import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureTokenStore, noopTokenStore } from '@/token-store';
import { useAuthStore } from '@/stores/auth.store';
import { setAuthFlowNavigation, useCurrentUser, useLogin } from './useAuth';
import { getMe, login } from '@/api/auth.api';

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

describe('current-user polling mirrors the profile into the auth store', () => {
  it('applies a profile change made on another device without saving the form', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    useAuthStore.setState({
      token: 'at',
      user: {
        id: 'u',
        email: 'a@example.test',
        displayName: 'Old',
        avatarUrl: null,
        preferences: null,
      },
    });
    vi.mocked(getMe).mockResolvedValue({
      id: 'u',
      email: 'a@example.test',
      displayName: 'New',
      avatarUrl: 'https://example.test/remote.png',
      preferences: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    renderHook(() => useCurrentUser(), { wrapper: queryWrapper });

    await waitFor(() =>
      expect(useAuthStore.getState().user?.avatarUrl).toBe('https://example.test/remote.png'),
    );
    expect(useAuthStore.getState().user?.displayName).toBe('New');
    client.clear();
  });

  it('does not write a stale cached profile back after the session is cleared', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    useAuthStore.setState({
      token: 'at',
      user: {
        id: 'u',
        email: 'a@example.test',
        displayName: 'Old',
        avatarUrl: null,
        preferences: null,
      },
    });
    vi.mocked(getMe).mockResolvedValue({
      id: 'u',
      email: 'a@example.test',
      displayName: 'New',
      avatarUrl: 'https://example.test/remote.png',
      preferences: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    renderHook(() => useCurrentUser(), { wrapper: queryWrapper });
    await waitFor(() => expect(useAuthStore.getState().user?.displayName).toBe('New'));

    await act(async () => {
      useAuthStore.setState({ token: null, user: null });
    });

    expect(useAuthStore.getState().user).toBeNull();
    client.clear();
  });
});
