/**
 * Hide Later Items 切换时稍后项的显隐动效：收起时内容先于高度淡出完，不会
 * 看到文字被压扁；展开时先腾出空间、内容再浮现；新出现的行底色淡淡一闪
 * 再褪去，让人看清刚才藏起来的是哪几条。高度 / 位移的时长与曲线沿用各自
 * 列表原有的进出场（useFlipList / Collapse），这里只调透明度节奏并补上高亮。
 */

/** 收起：透明度在整段进度的这一点之前降到 0。 */
const FADE_OUT_END = 0.6;
/** 展开：透明度从整段进度的这一点才开始升起。 */
const FADE_IN_START = 0.3;
const FLASH_MS = 900;
/** 高亮保持满色到这一点，之后褪回行原本的底色。 */
const FLASH_HOLD = 0.35;

export function revealExitOpacity(): Keyframe {
  return { opacity: 0, offset: FADE_OUT_END };
}

export function revealEnterOpacity(): Keyframe {
  return { opacity: 0, offset: FADE_IN_START };
}

/**
 * 给 root 内（含 root 自身）的行（data-selection-row）播一次底色高亮。
 * 末帧不写底色，褪回的是行当下的底色（如选中高亮），不会闪成透明。
 */
export function flashRevealedRows(root: Element) {
  const rows = root.matches('[data-selection-row]')
    ? [root]
    : Array.from(root.querySelectorAll('[data-selection-row]'));
  if (rows.length === 0 || typeof rows[0].animate !== 'function') return;
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  if (!primary) return;
  const color = `hsl(${primary} / 0.1)`;
  for (const row of rows) {
    row.animate([{ backgroundColor: color }, { backgroundColor: color, offset: FLASH_HOLD }], {
      duration: FLASH_MS,
      easing: 'ease-out',
    });
  }
}
