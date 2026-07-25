interface PlaceholderProps {
  title: string;
  hint?: string;
}

function Placeholder({ title, hint }: PlaceholderProps) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-6 flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        视图实现中
      </div>
    </div>
  );
}

export default function Inbox() {
  return <Placeholder title="Inbox" hint="快速收集你的想法" />;
}