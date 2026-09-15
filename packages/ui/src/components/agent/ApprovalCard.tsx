import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { AgentApprovalDto } from '@taskora/shared';

/**
 * Approval card for a destructive tool call (issue 04): tool name + argument
 * summary + approve/reject. No parameter editing in V1.
 */
export function ApprovalCard({
  approval,
  onResolve,
  pending,
}: {
  approval: AgentApprovalDto;
  onResolve: (decision: 'approve' | 'reject') => void;
  pending: boolean;
}) {
  const { t } = useTranslation(['agent']);
  const [resolved, setResolved] = useState<'approve' | 'reject' | null>(null);
  const statusFallback: 'approve' | 'reject' | null =
    approval.status === 'approved' ? 'approve' : approval.status === 'rejected' ? 'reject' : null;
  const effective = resolved ?? statusFallback;

  const argSummary = Object.entries(approval.args)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ');

  const handle = (decision: 'approve' | 'reject') => {
    setResolved(decision);
    onResolve(decision);
  };

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[85%] rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          {t('agent:approvalTitle')}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t('agent:approvalDescription')}</p>
        <p className="mt-2 rounded-lg bg-background/60 px-3 py-2 font-mono text-xs">
          <span className="font-semibold">{approval.toolName}</span>
          {argSummary ? ` — ${argSummary}` : ''}
        </p>
        {effective === 'approve' ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" /> {t('agent:approvalApproved')}
          </p>
        ) : effective === 'reject' ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <X className="h-3.5 w-3.5" /> {t('agent:approvalRejected')}
          </p>
        ) : effective === 'expired' ? (
          <p className="mt-2 text-xs text-muted-foreground">{t('agent:approvalExpired')}</p>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => handle('approve')} disabled={pending}>
              {pending && effective !== 'reject' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t('agent:approve')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handle('reject')} disabled={pending}>
              {t('agent:reject')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
