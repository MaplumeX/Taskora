import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // 窄屏（Android）按 Material 3：52×32 轨道；关闭时描边轨道 + 16px 灰色滑块，
      // 打开时主题色轨道 + 24px 滑块。
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-base max-md:h-8 max-md:w-[52px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-sidebar-accent max-md:data-[state=checked]:border-primary max-md:data-[state=unchecked]:border-muted-foreground max-md:data-[state=unchecked]:bg-muted',
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_hsl(0_0%_0%/0.2)] ring-0 transition-transform duration-base ease-spring data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
        'max-md:shadow-none max-md:transition-all max-md:data-[state=checked]:h-6 max-md:data-[state=checked]:w-6 max-md:data-[state=checked]:translate-x-[22px] max-md:data-[state=checked]:bg-primary-foreground max-md:data-[state=unchecked]:translate-x-1.5 max-md:data-[state=unchecked]:bg-muted-foreground',
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
