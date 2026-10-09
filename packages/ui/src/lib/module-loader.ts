export interface ModuleLoader<T> {
  (): Promise<T>;
  preload(): Promise<T>;
}

type ModuleRecovery = <T>(factory: () => Promise<T>) => Promise<T>;
let recovery: ModuleRecovery | undefined;
const backgroundErrors = new WeakSet<object>();

/** Web 注入既有 chunk 恢复机制；桌面和移动端无需刷新恢复。 */
export function setModuleLoadRecovery(handler: ModuleRecovery): void {
  recovery = handler;
}

export function isBackgroundModuleError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && backgroundErrors.has(error);
}

/** 预加载和实际渲染共用在途 Promise；预加载失败后允许真正进入时重试。 */
export function moduleLoader<T>(factory: () => Promise<T>): ModuleLoader<T> {
  let pending: Promise<T> | undefined;
  const raw = () => {
    pending ??= factory().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
  const load = () => (recovery ? recovery(raw) : raw());
  load.preload = () =>
    raw().catch((error: unknown) => {
      if (typeof error === 'object' && error !== null) backgroundErrors.add(error);
      throw error;
    });
  return load;
}
