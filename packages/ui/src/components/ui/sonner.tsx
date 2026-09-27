import type { ComponentProps } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

type ToasterProps = ComponentProps<typeof SonnerToaster>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <SonnerToaster
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:rounded-[10px] group-[.toaster]:border-0 group-[.toaster]:bg-popover/90 group-[.toaster]:text-foreground group-[.toaster]:shadow-popover group-[.toaster]:backdrop-blur-xl',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
export { toast } from 'sonner';
