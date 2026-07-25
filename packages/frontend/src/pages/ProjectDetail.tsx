import { useParams } from 'react-router-dom';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">项目</h1>
      <p className="text-sm text-muted-foreground">ID: {id}</p>
      <div className="mt-6 flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        视图实现中
      </div>
    </div>
  );
}