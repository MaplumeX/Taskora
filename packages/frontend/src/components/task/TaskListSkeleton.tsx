export function TaskListSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-3 px-2">
          <div className="skeleton h-[18px] w-[18px] shrink-0 rounded-full" />
          <div className="skeleton h-3.5 w-3/4" />
        </div>
      ))}
    </div>
  );
}
