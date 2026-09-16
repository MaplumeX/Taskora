import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsAssistant from './SettingsAssistant';

const mutationMocks = vi.hoisted(() => ({
  update: vi.fn(),
  test: vi.fn(),
}));

const configMock = vi.hoisted(() => vi.fn());

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useAgentConfig: () => ({ data: configMock(), isLoading: false }),
  useUpdateAgentConfig: () => ({ mutate: mutationMocks.update, isPending: false }),
  useTestAgentConfig: () => ({ mutate: mutationMocks.test, isPending: false }),
}));

const baseConfig = {
  configured: true,
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  modelId: 'deepseek-chat',
  apiKeyMasked: '••••abcd',
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsAssistant />
    </QueryClientProvider>,
  );
}

function inputByLabel(label: RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe('SettingsAssistant', () => {
  beforeEach(() => {
    mutationMocks.update.mockReset();
    mutationMocks.test.mockReset();
    configMock.mockReturnValue({ ...baseConfig });
  });

  it('loads the stored config and masks the key', async () => {
    renderPage();
    await waitFor(() =>
      expect(inputByLabel(/base url/i).value).toBe('https://api.deepseek.com/v1'),
    );
    expect(inputByLabel(/model id/i).value).toBe('deepseek-chat');
    expect(screen.getByText(/••••abcd/)).toBeTruthy();
  });

  it('fills preset defaults when picking a provider', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ollama' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Ollama' }));
    expect(inputByLabel(/base url/i).value).toBe('http://localhost:11434/v1');
    expect(inputByLabel(/model id/i).value).not.toBe('');
  });

  it('keeps the stored key when saving without entering a new one', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const payload = mutationMocks.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      modelId: 'deepseek-chat',
    });
    expect(payload.apiKey).toBeUndefined();
  });

  it('sends the new key when one is typed', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy());
    await userEvent.type(screen.getByLabelText(/api key/i), 'sk-new-key');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const payload = mutationMocks.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.apiKey).toBe('sk-new-key');
  });

  it('tests with the draft values', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /test/i })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }));
    expect(mutationMocks.test).toHaveBeenCalledWith(
      {
        baseUrl: 'https://api.deepseek.com/v1',
        modelId: 'deepseek-chat',
      },
      expect.anything(),
    );
  });
});
