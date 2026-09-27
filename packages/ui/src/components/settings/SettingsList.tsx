import * as React from 'react';
import { Check, ChevronRight, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ───────────────────────── 导航栈（窄屏设置） ───────────────────────── */

export interface SettingsPageEntry {
  title: string;
  /** 渲染时调用（读取实时 store），避免把过期闭包存进栈里。 */
  render: () => React.ReactNode;
}

interface SettingsNav {
  push: (entry: SettingsPageEntry) => void;
  pop: () => void;
}

const SettingsNavContext = React.createContext<SettingsNav | null>(null);

export const SettingsNavProvider = SettingsNavContext.Provider;

/**
 * 窄屏设置导航栈；返回 null 表示当前在桌面设置弹窗（或独立渲染的测试）
 * 中，设置页据此选择「列表单元格」还是「桌面表单」形态。
 */
export function useSettingsNav(): SettingsNav | null {
  return React.useContext(SettingsNavContext);
}

/* ───────────────────────── 列表基础组件 ───────────────────────── */

/** 分组：可选的小标题（header）与分组下方说明（footer）。 */
export function SettingsGroup({
  header,
  footer,
  children,
  className,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-1.5', className)}>
      {header && (
        <h3 className="px-4 text-[13px] font-medium text-muted-foreground">{header}</h3>
      )}
      <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl bg-card">
        {children}
      </div>
      {footer && <p className="px-4 text-[13px] leading-snug text-muted-foreground">{footer}</p>}
    </section>
  );
}

/** 首页分类行前的彩色圆角图标（iOS 设置风格）。 */
export function SettingsIcon({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return (
    <span
      aria-hidden
      className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white', className)}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

interface SettingsRowProps {
  label: React.ReactNode;
  /** 行首：图标（SettingsIcon 等）。 */
  leading?: React.ReactNode;
  /** 行下方的补充说明（单行内的小字）。 */
  description?: React.ReactNode;
  /** 右侧当前值（灰字）。 */
  value?: React.ReactNode;
  /** 右侧行内控件（开关、按钮等）；有 control 时行本身不可点击。 */
  control?: React.ReactNode;
  /** 点击行（推入下一页 / 执行动作）。 */
  onClick?: () => void;
  /** 显示 `›`（推入下一页）。 */
  chevron?: boolean;
  /** 危险操作：红字、居中。 */
  destructive?: boolean;
  /** 主操作按钮行：主题色字、居中。 */
  action?: boolean;
  disabled?: boolean;
  /** 作为表单提交按钮（保留 required / minLength 等原生校验）。 */
  submit?: boolean;
  /** 控件的 id，行标签作为其 <label>。 */
  htmlFor?: string;
}

const ROW_CLASS = 'flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[15px]';

export function SettingsRow({
  label,
  leading,
  description,
  value,
  control,
  onClick,
  chevron = false,
  destructive = false,
  action = false,
  disabled = false,
  submit = false,
  htmlFor,
}: SettingsRowProps) {
  const centered = destructive || action;
  const labelNode = htmlFor ? (
    <label htmlFor={htmlFor}>{label}</label>
  ) : (
    <span>{label}</span>
  );
  const body = (
    <>
      {leading}
      <span
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          centered && 'items-center',
          destructive && 'text-destructive',
          action && 'font-medium text-primary',
        )}
      >
        {labelNode}
        {description && (
          <span className="text-[13px] leading-snug text-muted-foreground">{description}</span>
        )}
      </span>
      {value !== undefined && (
        <span className="max-w-[55%] truncate text-[15px] text-muted-foreground">{value}</span>
      )}
      {control}
      {chevron && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
    </>
  );

  if ((onClick || submit) && !control) {
    return (
      <button
        type={submit ? 'submit' : 'button'}
        disabled={disabled}
        onClick={onClick}
        className={cn(ROW_CLASS, 'transition-colors active:bg-accent disabled:opacity-50')}
      >
        {body}
      </button>
    );
  }
  return <div className={ROW_CLASS}>{body}</div>;
}

/** 文本输入单元格：标签在上、无边框输入框在下。 */
export function SettingsInputRow({
  id,
  label,
  className,
  ...inputProps
}: { id: string; label: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2">
      <label htmlFor={id} className="text-[13px] text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        className={cn(
          'h-8 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60',
          className,
        )}
        {...inputProps}
      />
    </div>
  );
}

/** ✓ 选项组：每个选项一行，选中项末尾打勾。 */
export function SettingsOptionGroup<T extends string | number>({
  header,
  footer,
  options,
  value,
  onChange,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <SettingsGroup header={header} footer={footer}>
      <div role="radiogroup" className="flex flex-col divide-y divide-border/60">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={cn(ROW_CLASS, 'transition-colors active:bg-accent')}
            >
              <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              {selected && <Check aria-hidden className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </SettingsGroup>
  );
}

/** 页面容器：分组间距。 */
export function SettingsPage({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}
