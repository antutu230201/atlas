'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button, Card, CardContent, Skeleton } from '@atlas/ui';
import { api } from '@/lib/api';
import type { ModulePageProps } from './types';

interface WidgetData {
  openCount: number;
  recent: Array<{ id: string; title: string; status: string; dueDate: string | null }>;
}

/** 首页"今天"小组件：未完成计数 + 最近五条 */
export function TodoTodayWidget({ workspaceSlug, moduleName }: ModulePageProps) {
  const queryClient = useQueryClient();
  const widget = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'widgetToday'],
    queryFn: () =>
      api<WidgetData>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/widgetToday`, {
        method: 'POST',
      }),
  });

  const complete = useMutation({
    mutationFn: (id: string) =>
      api(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/setStatus`, {
        method: 'POST',
        json: { id, status: 'done' },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['module', moduleName, workspaceSlug] });
    },
  });

  const data = widget.data;

  return (
    <Card className={undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">今日待办</p>
          {data ? (
            <p className="text-2xl font-bold text-primary">{data.openCount}</p>
          ) : (
            <Skeleton className="h-7 w-10" />
          )}
        </div>
        {widget.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : data && data.recent.length > 0 ? (
          <ul className="space-y-2">
            {data.recent.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{row.title}</span>
                {row.status !== 'done' ? (
                  <Button size="sm" variant="ghost" onClick={() => complete.mutate(row.id)}>
                    完成
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">全部完成，享受今天吧。</p>
        )}
        <Link
          href={`/m/${moduleName}/list`}
          className="inline-block text-xs text-primary hover:underline"
        >
          查看全部 →
        </Link>
      </CardContent>
    </Card>
  );
}
