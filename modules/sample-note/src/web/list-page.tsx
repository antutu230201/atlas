'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ModulePageProps } from './types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  IconButton,
  Input,
  Skeleton,
  Textarea,
} from '@atlas/ui';
import { api } from '@/lib/api';

interface NoteRow {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

/** 示例模块页面：list / create / remove 三个动作经内核网关调用 */
export function SampleNoteListPage({ workspaceSlug, moduleName }: ModulePageProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['module', moduleName, workspaceSlug, 'list'],
    queryFn: () =>
      api<{ notes: NoteRow[] }>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/list`, {
        method: 'POST',
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['module', moduleName] });

  const create = useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      api<NoteRow>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/create`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      setError(null);
      void invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api<{ removed: string }>(`/modules/workspaces/${workspaceSlug}/${moduleName}/call/remove`, {
        method: 'POST',
        json: { id },
      }),
    onSuccess: () => void invalidate(),
  });

  const notes = list.data?.notes ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>新建笔记</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="note-title" label="标题" required error={error}>
            <Input
              id="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="记录今天的一件小事…"
            />
          </Field>
          <Field id="note-body" label="正文" hint="可选，最多 5000 字">
            <Textarea
              id="note-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="写点什么…"
            />
          </Field>
          <Button
            loading={create.isPending}
            onClick={() => create.mutate({ title, body })}
            disabled={title.trim().length === 0}
          >
            保存
          </Button>
        </CardContent>
      </Card>

      {list.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          title="还没有笔记"
          description="写下第一条笔记，验证模块全链路：网关调用、租户隔离与事件落库。"
        />
      ) : (
        <div className="space-y-3">
          {notes.map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <CardTitle>{row.title}</CardTitle>
                <IconButton
                  aria-label={`删除 ${row.title}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => remove.mutate(row.id)}
                >
                  ✕
                </IconButton>
              </CardHeader>
              {row.body ? <CardContent className="text-muted">{row.body}</CardContent> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
