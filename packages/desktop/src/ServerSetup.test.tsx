import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ setServerUrl: vi.fn() }));

// Keep the real `parseServerUrl` (it has its own unit tests) and stub only the
// store hook so we can observe what the form decided to persist.
vi.mock('@/server-settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./server-settings')>();
  return {
    ...actual,
    useServerSettings: (selector: (state: unknown) => unknown) =>
      selector({ serverUrl: null, setServerUrl: mocks.setServerUrl }),
  };
});

const { ServerSetup } = await import('./ServerSetup');

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

/** Fill the form and submit it. */
function submit(url: string) {
  render(<ServerSetup />);
  fireEvent.change(screen.getByLabelText(/Server address|服务器地址/), {
    target: { value: url },
  });
  fireEvent.click(screen.getByRole('button', { name: /Connect|连接/ }));
}

const unreachable = /Cannot reach this server|无法连接到该服务器/;

describe('ServerSetup', () => {
  it('saves the normalized URL once /health answers 2xx', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    submit('task.example.com/api/v1');

    await waitFor(() =>
      expect(mocks.setServerUrl).toHaveBeenCalledWith('http://task.example.com/api/v1'),
    );
    expect(fetchMock).toHaveBeenCalledWith('http://task.example.com/api/v1/health', {
      method: 'GET',
    });
  });

  it('rejects a host that answers but is not a Taskora API', async () => {
    // A reachable-but-wrong address: the request succeeds, the status is 404.
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    submit('https://task.maplume.de/api/v1');

    await waitFor(() => expect(screen.getByText(unreachable)).toBeInTheDocument());
    expect(mocks.setServerUrl).not.toHaveBeenCalled();
  });

  it('rejects a server that cannot be reached at all', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    submit('https://nope.example.com/api/v1');

    await waitFor(() => expect(screen.getByText(unreachable)).toBeInTheDocument());
    expect(mocks.setServerUrl).not.toHaveBeenCalled();
  });

  it('rejects an invalid address without probing the network', async () => {
    submit('ftp://task.example.com');

    await waitFor(() =>
      expect(screen.getByText(/Invalid server address|服务器地址无效/)).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.setServerUrl).not.toHaveBeenCalled();
  });
});
