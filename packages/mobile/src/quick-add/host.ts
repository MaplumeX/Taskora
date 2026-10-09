/**
 * 快速添加浮层的原生宿主桥（QuickAddActivity 经 addJavascriptInterface
 * 注入的 `TaskoraQuickAddHost`，方法同步调用、参数只能是基本类型）。
 *
 * 草稿不在这里落库：submit 把 QuickAddDraft JSON 交给原生入队，与旧版
 * 原生卡片同一条通路（StatusBarPlugin.submitQuickAdd → 主 WebView 的
 * createFromQuickAddDraft），进程未起时也不丢。
 */

/** 提交后浮层的去向：关闭 / 留着继续添加 / 拉起 App 定位到新任务。 */
export type QuickAddSubmitMode = 'close' | 'continue' | 'openInApp';

export interface QuickAddHost {
  /** 主 WebView 写入的数据快照（quick-add-snapshot.ts），没有时为 null。 */
  getSnapshot(): string | null;
  /** 系统当前是否深色（主题设置为「跟随系统」时用）。 */
  isSystemDark(): boolean;
  /** 卡片已挂载并聚焦标题：原生播进场动画、弹出键盘。 */
  ready(): void;
  submit(draftJson: string, mode: QuickAddSubmitMode): void;
  /** 放弃草稿并关闭浮层。 */
  dismiss(): void;
}

/** 原生调用的页面入口（返回键：有选择器开着时只关选择器）。 */
export interface QuickAddPage {
  back(): boolean;
}

declare global {
  interface Window {
    TaskoraQuickAddHost?: QuickAddHost;
    taskoraQuickAdd?: QuickAddPage;
  }
}

/** 浏览器里直接打开页面（开发调试）时的空宿主：数据为空、提交只打日志。 */
const browserHost: QuickAddHost = {
  getSnapshot: () => null,
  isSystemDark: () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  ready: () => undefined,
  submit: (draftJson, mode) => console.info('[quick-add] submit', mode, draftJson),
  dismiss: () => console.info('[quick-add] dismiss'),
};

export function getQuickAddHost(): QuickAddHost {
  return window.TaskoraQuickAddHost ?? browserHost;
}
