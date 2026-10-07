import type { ComponentProps } from 'react';
import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert } from 'lucide-react';
import { Toaster as SonnerToaster } from 'sonner';

type ToasterProps = ComponentProps<typeof SonnerToaster>;

/*
 * Toast 是只有一行内容的弹层（spec「Popover / DropdownMenu / Tooltip」）：与菜单同一
 * 毛玻璃底与 shadow-popover，类型只体现在 16px 线性图标的语义色上，不整块填色。
 * unstyled 关掉 sonner 的外观样式（rich colors、按钮、字体），定位 / 堆叠 / 滑动仍由它负责；
 * 折叠堆叠时隐藏后排内容的规则原本挂在 data-styled 上，这里补回。
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <SonnerToaster
      icons={{
        success: <CircleCheck className="h-4 w-4 text-success" />,
        error: <CircleAlert className="h-4 w-4 text-destructive" />,
        warning: <TriangleAlert className="h-4 w-4 text-warning" />,
        info: <Info className="h-4 w-4 text-primary" />,
        loading: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[var(--width)] items-center gap-2.5 rounded-[10px] bg-popover/90 px-3 py-2.5 font-sans text-body text-popover-foreground shadow-popover backdrop-blur-xl backdrop-saturate-150 transition-[transform,opacity,height] duration-base ease-spring motion-reduce:transition-opacity [&[data-expanded=false][data-front=false]>*]:opacity-0',
          icon: 'm-0',
          content: 'min-w-0 flex-1',
          title: 'font-normal',
          description: 'text-meta text-muted-foreground',
          actionButton:
            '-my-1 h-7 shrink-0 rounded-md px-2 font-medium text-primary transition-colors hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:-my-3 max-md:h-11',
          cancelButton:
            '-my-1 h-7 shrink-0 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:-my-3 max-md:h-11',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
export { toast } from 'sonner';
