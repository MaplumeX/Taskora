/**
 * 回顾模式的键盘命令通道：回顾模式挂载时登记处理函数，KeyboardShortcuts
 * 把「标记已回顾并下一个 / 跳过 / 上一个」转给它。不在回顾模式时没有
 * 处理函数，按键不被拦截。
 */

export type ReviewCommand = 'markNext' | 'skip' | 'previous';

let handler: ((command: ReviewCommand) => void) | null = null;

/** 登记处理函数；返回注销函数。 */
export function registerReviewCommands(next: (command: ReviewCommand) => void): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** 交给回顾模式处理；不在回顾模式时返回 false。 */
export function runReviewCommand(command: ReviewCommand): boolean {
  if (!handler) return false;
  handler(command);
  return true;
}
