import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// 自定义字阶（tailwind.preset.js 的 fontSize）需登记为字号，否则 tailwind-merge
// 会把 `text-body` 当作文字颜色，与 `text-muted-foreground` 互相覆盖。
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['title-1', 'title-2', 'section', 'body', 'meta'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
