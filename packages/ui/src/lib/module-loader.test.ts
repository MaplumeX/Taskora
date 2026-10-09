import { describe, expect, it, vi } from 'vitest';
import { isBackgroundModuleError, moduleLoader } from './module-loader';

describe('moduleLoader', () => {
  it('shares the pending module between preload and navigation without mounting it', async () => {
    const component = vi.fn();
    let resolve!: (value: { default: typeof component }) => void;
    const factory = vi.fn(
      () =>
        new Promise<{ default: typeof component }>((done) => {
          resolve = done;
        }),
    );
    const load = moduleLoader(factory);
    const preload = load.preload();
    const navigation = load();
    expect(factory).toHaveBeenCalledTimes(1);
    resolve({ default: component });
    expect(await preload).toBe(await navigation);
    expect(await load()).toBe(await navigation);
    expect(component).not.toHaveBeenCalled();
  });

  it('a failed preload is marked for silent handling and retried on navigation', async () => {
    const error = new Error('chunk unavailable');
    const module = { default: () => null };
    const factory = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(module);
    const load = moduleLoader(factory);
    await expect(load.preload()).rejects.toBe(error);
    expect(isBackgroundModuleError(error)).toBe(true);
    await expect(load()).resolves.toBe(module);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
