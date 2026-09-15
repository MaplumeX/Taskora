import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Desktop connection settings (non-sensitive, localStorage is fine —
 * auth tokens use native secure storage).
 */
interface ServerSettingsState {
  /** Base URL of the self-hosted server API, e.g. https://taskora.example.com/api/v1 */
  serverUrl: string | null;
  setServerUrl: (url: string | null) => void;
}

function normalize(url: string): string | null {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export const useServerSettings = create<ServerSettingsState>()(
  persist(
    (set) => ({
      serverUrl: null,
      setServerUrl: (url) => set({ serverUrl: normalize(url ?? '') }),
    }),
    { name: 'taskora-desktop-server' },
  ),
);

/** Persisted, normalized server URL (or null when unset). */
export function getServerUrl(): string | null {
  return useServerSettings.getState().serverUrl;
}

/** Validate + normalize a user-entered server URL; null when invalid. */
export function parseServerUrl(input: string): string | null {
  const normalized = normalize(input);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return normalized;
  } catch {
    return null;
  }
}
