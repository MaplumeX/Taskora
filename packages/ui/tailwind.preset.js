import tailwindcssAnimate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';

/**
 * 三端共享的 Tailwind preset：主题（字体、颜色 token、圆角）与插件。
 * 各壳的 tailwind.config.js 只声明自己的 content。
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: ['class'],
  content: [],
  theme: {
    extend: {
      fontFamily: {
        // 系统字体栈（不依赖网络字体）：macOS/iOS → SF，Windows → Segoe UI Variable，
        // 中文回退 PingFang / 微软雅黑 / Noto。
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'system-ui',
          '"PingFang SC"',
          '"Microsoft YaHei UI"',
          '"Microsoft YaHei"',
          '"Noto Sans CJK SC"',
          'sans-serif',
        ],
      },
      // 字阶（spec「字体」）：title-1 视图大标题、title-2 卡片 / Dialog 标题、
      // section 分组头、body 正文、meta 元信息。
      fontSize: {
        'title-1': ['28px', { lineHeight: '34px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'title-2': ['20px', { lineHeight: '26px', letterSpacing: '-0.005em', fontWeight: '700' }],
        section: ['13px', { lineHeight: '18px', fontWeight: '600' }],
        body: ['14px', { lineHeight: '20px' }],
        meta: ['12px', { lineHeight: '16px' }],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          accent: 'hsl(var(--sidebar-accent))',
        },
        selection: 'hsl(var(--selection))',
        today: 'hsl(var(--today))',
        deadline: 'hsl(var(--deadline))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        nav: {
          inbox: 'hsl(var(--nav-inbox))',
          today: 'hsl(var(--nav-today))',
          upcoming: 'hsl(var(--nav-upcoming))',
          calendar: 'hsl(var(--nav-calendar))',
          anytime: 'hsl(var(--nav-anytime))',
          someday: 'hsl(var(--nav-someday))',
          logbook: 'hsl(var(--nav-logbook))',
        },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      transitionTimingFunction: {
        spring: 'var(--ease-spring)',
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
};
