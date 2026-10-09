import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pending: false,
  sync: 'idle',
  prefetch: vi.fn(),
  modules: new Map<string, ReturnType<typeof vi.fn>>(),
}));
vi.mock('@taskora/api', () => ({
  hasPendingLiveQueries: () => state.pending,
  prefetchProject: state.prefetch,
  useSyncStatusStore: { getState: () => ({ status: state.sync }) },
}));
vi.mock('./page-loaders', () => {
  const loaders = Object.fromEntries(
    [
      'ProjectDetail',
      'AreaDetail',
      'Anytime',
      'Upcoming',
      'Inbox',
      'Someday',
      'Calendar',
      'Review',
      'Logbook',
      'LaterProjects',
      'Tags',
      'TagDetail',
      'Trash',
      'Search',
      'Home',
      'Today',
      'Agent',
      'SettingsModal',
      'AssistantPanel',
      'appearance',
    ].map((name) => {
      const preload = vi.fn(async () => ({}));
      state.modules.set(name, preload);
      return [name, { preload }];
    }),
  );
  return {
    pageLoaders: loaders,
    shellLoaders: loaders,
    settingsLoaders: { appearance: loaders.appearance },
    loaderForRoute: (route: string) =>
      route.startsWith('/projects/') ? loaders.ProjectDetail : loaders.Calendar,
  };
});

import {
  NavigationPreloadProvider,
  NavigationWarmup,
  useNavigationPreloadIntent,
} from './navigation-preload';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  state.pending = false;
  state.sync = 'idle';
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderWarmup(platform: 'desktop' | 'web', child = <NavigationWarmup />) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NavigationPreloadProvider platform={platform}>{child}</NavigationPreloadProvider>
    </QueryClientProvider>,
  );
}

describe('startup preloading', () => {
  it('does not require a query client or load modules when preloading is not enabled', async () => {
    const view = render(<NavigationWarmup />);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(view.container).toBeEmptyDOMElement();
    for (const preload of state.modules.values()) expect(preload).not.toHaveBeenCalled();
  });

  it('waits for the current page module and data before starting background loads', async () => {
    let finish!: () => void;
    let done = false;
    const pending = new Promise<void>((resolve) => {
      finish = () => {
        done = true;
        resolve();
      };
    });
    function Page() {
      if (!done) throw pending;
      return <p>Current page</p>;
    }
    renderWarmup(
      'web',
      <Suspense fallback={<p>Loading</p>}>
        <Page />
        <NavigationWarmup />
      </Suspense>,
    );
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(state.modules.get('ProjectDetail')).not.toHaveBeenCalled();
    state.pending = true;
    await act(async () => {
      finish();
      await pending;
    });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(state.modules.get('ProjectDetail')).not.toHaveBeenCalled();
    state.pending = false;
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(state.modules.get('ProjectDetail')).toHaveBeenCalledTimes(1);
  });

  it('web only warms common routes while desktop also warms secondary features', async () => {
    const web = renderWarmup('web');
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(state.modules.get('ProjectDetail')).toHaveBeenCalledTimes(1);
    expect(state.modules.get('Calendar')).not.toHaveBeenCalled();
    expect(state.modules.get('SettingsModal')).not.toHaveBeenCalled();
    web.unmount();
    vi.clearAllMocks();
    renderWarmup('desktop');
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(state.modules.get('Calendar')).toHaveBeenCalledTimes(1);
    expect(state.modules.get('SettingsModal')).toHaveBeenCalledTimes(1);
  });
});

function IntentSurface() {
  return (
    <div {...useNavigationPreloadIntent()}>
      <div data-testid="project" data-preload-route="/projects/p1" tabIndex={0}>
        <span>Project</span>
      </div>
      <a href="/calendar">Calendar</a>
    </div>
  );
}

describe('navigation intent', () => {
  it('debounces hover, cancels quick pass-through, and prefetches keyboard focus', async () => {
    const view = renderWarmup('desktop', <IntentSurface />);
    const project = view.getByTestId('project');
    fireEvent.pointerOver(project, { pointerType: 'mouse' });
    await act(() => vi.advanceTimersByTimeAsync(50));
    fireEvent.pointerOut(project);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).not.toHaveBeenCalled();
    fireEvent.pointerOver(project, { pointerType: 'mouse' });
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).toHaveBeenCalledWith('p1');
    state.prefetch.mockClear();
    fireEvent.focus(project);
    expect(state.prefetch).toHaveBeenCalledWith('p1');
  });

  it('save-data mode skips code downloads but still prepares the local replica', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
    const view = renderWarmup('web', <IntentSurface />);
    fireEvent.focus(view.getByTestId('project'));
    expect(state.prefetch).toHaveBeenCalledWith('p1');
    expect(state.modules.get('ProjectDetail')).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'connection');
  });
});
