/**
 * 状态栏常驻通知薄壳接口（android-status-bar，滴答清单形态）。
 *
 * 平台无关控制器（controller.ts）维护任务列表与轮播游标；真正落到
 * 系统通知 API（tauri-plugin-notification）的部分收敛在本接口后面，
 * 由 Mobile 应用在 init 时注册实现（web/desktop 不注册 → 设置页不渲
 * 染开关）。与 reminders 的 notification-shell 同一模式。
 */

export interface StatusBarActionEvent {
  /**
   * 动作 id：'quick-add'（通知内输入提交）| 'next'（切换下一条）|
   * 'tap'（点按通知本体，系统已拉起 Activity）| 'dismiss'（划掉）。
   */
  actionId: string;
  /** RemoteInput 文本（actionId 为 'quick-add' 时可能有值）。 */
  inputValue?: string | null;
}

export interface StatusBarShell {
  /** 当前是否已获通知授权。 */
  isPermissionGranted(): Promise<boolean>;
  /** 请求通知授权；返回是否 granted。 */
  requestPermission(): Promise<boolean>;
  /** 发布/覆盖更新常驻通知（固定 id，ongoing）。 */
  post(content: { title: string }): Promise<void>;
  /** 撤下常驻通知。 */
  clear(): Promise<void>;
  /** 注册动作回调（实现侧只注册一次系统监听，转发给最近注册的 cb）。 */
  onAction(cb: (event: StatusBarActionEvent) => void): void;
  /** 跳转系统通知设置页（权限被拒后的引导）。 */
  openSettings(): Promise<void>;
}

let shell: StatusBarShell | null = null;

/** 注册/注销薄壳。应用 init 时调用（Tauri 环境）；不注册则功能不可用。 */
export function setStatusBarShell(next: StatusBarShell | null): void {
  shell = next;
}

export function getStatusBarShell(): StatusBarShell | null {
  return shell;
}
