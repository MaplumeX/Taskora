import { createContext, useContext } from 'react';

/**
 * 是否在回顾模式中渲染（Review Mode）。回顾中删除当前对象由回顾会话自动
 * 前进到下一个，页面自身不再跳走。
 */
export const ReviewModeContext = createContext(false);

export function useInReviewMode(): boolean {
  return useContext(ReviewModeContext);
}
