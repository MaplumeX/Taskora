import type { AgentSseEvent } from '@taskora/shared';

import { apiClient } from './client';
import { getTokenStore } from '@/token-store';
import { useAuthStore } from '@/stores/auth.store';

/**
 * SSE subscription for the Assistant.
 *
 * The native EventSource cannot send an Authorization header, so this uses
 * fetch + a ReadableStream reader and parses the `text/event-stream` frames
 * manually. Returns a disposer that aborts the underlying request.
 */
export function subscribeAgentEvents(
  conversationId: string,
  onEvent: (event: AgentSseEvent) => void,
  onError?: (error: Error) => void,
): () => void {
  const controller = new AbortController();
  const base = apiClient.defaults.baseURL ?? '';
  const url = `${base.replace(/\/+$/, '')}/agent/conversations/${conversationId}/events`;
  const token = getTokenStore().get() ?? useAuthStore.getState().token;

  (async () => {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separator: { end: number; next: number } | undefined;
        // Frames are separated by a blank line; tolerate \r\n.
        while ((separator = findFrameSeparator(buffer)) !== undefined) {
          const frame = buffer.slice(0, separator.end);
          buffer = buffer.slice(separator.next);
          const parsed = parseFrame(frame);
          if (parsed) onEvent(parsed);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        onError?.(error as Error);
      }
    }
  })();

  return () => controller.abort();
}

function findFrameSeparator(buffer: string): { end: number; next: number } | undefined {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1 && crlf === -1) return undefined;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) {
    return { end: crlf, next: crlf + 4 };
  }
  return { end: lf, next: lf + 2 };
}

function parseFrame(frame: string): AgentSseEvent | null {
  // Only JSON payloads on `data:` lines; comments and event names ignored —
  // every event already carries its discriminated `type` inside the payload.
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      try {
        return JSON.parse(line.slice(5).trim()) as AgentSseEvent;
      } catch {
        return null;
      }
    }
  }
  return null;
}
