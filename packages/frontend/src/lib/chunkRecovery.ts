/**
 * 部署后旧 chunk 失效的自愈（浏览器侧）。
 *
 * 发布新镜像会重建带 hash 的 assets 并删除上一版。仍停在旧页面的浏览器在
 * 懒加载路由时会 import 到已被删除的 chunk，抛
 * `Failed to fetch dynamically imported module`，页面卡死且不会自愈。
 *
 * 策略：自动硬刷新以换到最新构建，刷新会重新拉取入口 HTML 从而拿到新版
 * chunk 名。用 sessionStorage 记一个冷却时间戳（而非「每会话一次」的布尔
 * 位）来防止刷新循环：
 *
 * - 「每会话一次」会被其它成功加载的 chunk 意外重置（唯一能清掉标记的时机
 *   就是别处加载成功），若真有一个 chunk 永久 404，就会「A 成功清标记 →
 *   B 失败刷新 → 刷新后 A 又成功 …」无限循环。
 * - 时间戳不会被成功加载重置：冷却期内再失败只会把错误交给上层，循环被
 *   打断；冷却过后（下一次真实部署）又能自愈。
 */

import { isBackgroundModuleError } from '@taskora/ui/lib/module-loader';

/** sessionStorage 位：上一次为「换到新构建」自动刷新的时间戳（ms）。 */
const CHUNK_RELOAD_FLAG = 'taskora:chunk-reload-at';

/** 两次自愈刷新的最小间隔，防刷新循环。 */
const RELOAD_COOLDOWN_MS = 10_000;

/** 实际执行硬刷新的函数，抽出来是为了测试可注入（jsdom 的 Location 不可打桩）。 */
let reloadPage: () => void = () => window.location.reload();

/** 测试专用：替换刷新实现。 */
export function __setReloadForTest(impl: () => void): void {
  reloadPage = impl;
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // 隐私模式等场景访问 sessionStorage 会直接抛异常
    return null;
  }
}

/**
 * 自动硬刷新一次以换到最新构建。
 *
 * 返回 `true` 表示已发起刷新——调用方应挂起当前渲染，避免刷新前再抛错；
 * 返回 `false` 表示仍在冷却期内（或拿不到 sessionStorage），此时只能把错误
 * 交给上层展示，或让用户手动刷新。
 */
export function reloadOnceForNewBuild(): boolean {
  const storage = safeSessionStorage();
  if (!storage) return false;

  const now = Date.now();
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_FLAG));
    if (Number.isFinite(last) && now - last < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(CHUNK_RELOAD_FLAG, String(now));
  } catch {
    return false;
  }

  reloadPage();
  return true;
}

let installed = false;

/**
 * Vite 在 modulepreload 失败时会派发 `vite:preloadError`；不拦截的话它会把
 * 原始错误抛到 window，表现为白屏。这里统一走自愈逻辑。
 */
export function installChunkLoadRecovery(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('vite:preloadError', (event: Event) => {
    const error = (event as Event & { payload?: unknown }).payload;
    if (error !== undefined) {
      // 让 import 正常 reject，预加载器才能清除失败 Promise。下一轮任务
      // 再判定错误来源：后台失败不刷新；实际渲染仍由 loadWithRecovery 自愈。
      setTimeout(() => {
        if (!isBackgroundModuleError(error)) reloadOnceForNewBuild();
      }, 0);
      return;
    }
    event.preventDefault();
    reloadOnceForNewBuild();
  });
}
