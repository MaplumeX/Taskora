import * as React from 'react';

/**
 * 当前子树的任务行是否可左滑进入多选模式。多选工具栏固定在页面底部，
 * 浮层内的任务列表（搜索弹窗、日历当天抽屉）会被浮层盖住，由其用
 * `false` 关闭。
 */
export const MultiSelectEnabledContext = React.createContext(true);
