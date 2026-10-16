import { createContext, useContext } from 'react';

/**
 * 当前子树是否给 Someday 条目画特殊标记（任务复选框虚线、项目进度环虚线灰色）。
 * 某天视图里全部都是 Someday 条目，标记没有区分意义，由其用 `false` 关闭。
 */
export const SomedayMarkContext = createContext(true);

export function useSomedayMark(): boolean {
  return useContext(SomedayMarkContext);
}
