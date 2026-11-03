import * as React from 'react';

/**
 * 引用不变、调用时总执行最新版本的回调，让 memo 过的列表行不因父组件每次
 * 渲染新建闭包而重渲染。缺省（undefined）原样返回：行据回调有无决定是否可点。
 */
export function useStableCallback<T extends (() => void) | undefined>(callback: T): T {
  const latest = React.useRef(callback);
  latest.current = callback;
  const stable = React.useCallback(() => latest.current?.(), []);
  return (callback ? stable : undefined) as T;
}
