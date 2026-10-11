import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleArrowUp } from 'lucide-react';

import { getUpdateShell, selectPendingUpdate, useUpdateStore } from '@taskora/api';

import { Button } from '@/components/ui/button';

/**
 * 更新提示（ADR-0025）：平台壳准备好所连服务器的版本后出现在角落，不拦截
 * 操作。「稍后」只在本次运行内收起该版本；「跳过此版本」记住，自动检查
 * 不再提示；必须更新（客户端协议过旧、同步已停）没有跳过。
 * 未注册平台壳的 web 端不渲染。
 */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const verdict = useUpdateStore((s) => s.verdict);
  const readyVersion = useUpdateStore((s) => s.readyVersion);
  const skippedVersion = useUpdateStore((s) => s.skippedVersion);
  const skipVersion = useUpdateStore((s) => s.skipVersion);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [failed, setFailed] = useState(false);

  const shell = getUpdateShell();
  const pending = selectPendingUpdate({ verdict, readyVersion, skippedVersion });
  if (!shell || !pending || pending.version === dismissedVersion) return null;
  const { version, required } = pending;

  const apply = async () => {
    setApplying(true);
    setFailed(false);
    try {
      await shell.apply(version);
    } catch (error) {
      console.warn('[updates] 安装更新失败', error);
      setFailed(true);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      role="status"
      data-update-prompt={required ? 'required' : 'available'}
      className="fixed bottom-[calc(0.75rem+var(--kb-inset,0px))] left-3 z-40 flex max-w-sm flex-col gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg max-md:right-3 max-md:bottom-auto max-md:top-[calc(var(--safe-area-top)+3.5rem)] max-md:max-w-none"
    >
      <div className="flex items-start gap-2">
        <CircleArrowUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          {t(required ? 'common:updatePromptRequired' : 'common:updatePromptAvailable', {
            version,
          })}
        </p>
      </div>
      {failed && <p className="text-destructive">{t('common:updatePromptFailed')}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {!required && (
          <Button variant="ghost" size="sm" onClick={() => skipVersion(version)}>
            {t('common:updatePromptSkip')}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setDismissedVersion(version)}>
          {t('common:updatePromptLater')}
        </Button>
        <Button size="sm" disabled={applying} onClick={() => void apply()}>
          {t(
            shell.action === 'restart'
              ? 'common:updatePromptRestart'
              : 'common:updatePromptDownload',
          )}
        </Button>
      </div>
    </div>
  );
}
