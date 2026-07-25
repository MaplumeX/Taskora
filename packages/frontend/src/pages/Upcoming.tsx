function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        视图实现中
      </div>
    </div>
  );
}

export default function Upcoming() {
  return <Placeholder title="Upcoming" />;
}