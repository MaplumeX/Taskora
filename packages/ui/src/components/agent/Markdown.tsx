import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/lib/utils';

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation(['agent']);
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="absolute right-2 top-2 rounded-md border border-border bg-background/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/code:opacity-100"
      aria-label={t('agent:copyCode')}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable (insecure context); ignore
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * Markdown renderer for Assistant replies. GFM tables/checkboxes included;
 * code blocks get a copy button. Sized to fit the chat column (prose-sm).
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none break-words',
        // Tighten prose defaults for chat
        'prose-p:leading-relaxed prose-headings:mb-2 prose-headings:mt-4 prose-headings:first:mt-0',
        'prose-pre:my-3 prose-pre:rounded-xl prose-pre:border prose-pre:border-border prose-pre:bg-muted/60',
        'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none',
        'prose-code:font-normal prose-pre:code:bg-transparent prose-pre:code:px-0',
        'prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-blockquote:my-2',
        'prose-table:my-3 prose-th:px-2 prose-td:px-2',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => {
            // Extract the raw text of the code block for the copy button.
            const child = Array.isArray(children) ? children[0] : children;
            const text =
              child && typeof child === 'object' && 'props' in child
                ? String((child.props as { children?: unknown }).children ?? '')
                : '';
            return (
              <div className="group/code relative">
                <pre>{children}</pre>
                <CopyButton text={text} />
              </div>
            );
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
